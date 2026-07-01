use serde::Serialize;
use std::{
    env, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const ENDPOINT: &str = "http://127.0.0.1:11435";
const HOST: &str = "127.0.0.1:11435";
const SERVER_RESOURCE_DIR: &str = "modelgate-server";
const USER_CONFIG_FILE: &str = "modelgate.config.yaml";
const HEALTH_TIMEOUT: Duration = Duration::from_millis(800);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const NODE_CHECK_TIMEOUT: Duration = Duration::from_millis(1500);
const STARTUP_LOG_LIMIT: usize = 32;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ServerLifecycle {
    Stopped,
    Starting,
    Running,
    Stopping,
    Failed,
}

impl Default for ServerLifecycle {
    fn default() -> Self {
        Self::Stopped
    }
}

impl ServerLifecycle {
    fn as_str(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Running => "running",
            Self::Stopping => "stopping",
            Self::Failed => "failed",
        }
    }

    fn mode(self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Running => "managed",
            Self::Stopping => "stopping",
            Self::Failed => "failed",
        }
    }
}

#[derive(Default)]
struct ServerProcessInner {
    child: Option<Child>,
    pid: Option<u32>,
    status: ServerLifecycle,
    started_at: Option<String>,
    last_error: Option<String>,
    startup_log: Vec<String>,
    root: Option<PathBuf>,
    config_path: Option<PathBuf>,
}

#[derive(Default)]
pub struct ServerProcessState {
    inner: Mutex<ServerProcessInner>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProcessStatus {
    status: String,
    endpoint: String,
    reachable: bool,
    managed: bool,
    running: bool,
    pid: Option<u32>,
    mode: String,
    message: Option<String>,
    started_at: Option<String>,
    last_error: Option<String>,
    startup_log: Vec<String>,
    root: Option<String>,
    config_path: Option<String>,
}

impl ServerProcessState {
    pub fn stop_managed_child(&self) {
        let child = {
            let Ok(mut inner) = self.inner.lock() else {
                return;
            };
            inner.child.take()
        };

        if let Some(mut child) = child {
            let _ = child.kill();
            let _ = child.wait();
        }

        if let Ok(mut inner) = self.inner.lock() {
            inner.status = ServerLifecycle::Stopped;
            inner.pid = None;
            push_log_locked(
                &mut inner,
                "Managed server process stopped during app shutdown.",
            );
        }
    }

    fn current_status(&self, message: Option<String>) -> Result<ServerProcessStatus, String> {
        let reachable = is_reachable();
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Server process state lock is poisoned".to_string())?;
        cleanup_exited_child_locked(&mut inner);
        Ok(status_from_locked(&inner, reachable, message))
    }

    fn mark_preparing_start(&self, message: &str) -> Result<(), String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Server process state lock is poisoned".to_string())?;
        cleanup_exited_child_locked(&mut inner);
        inner.status = ServerLifecycle::Starting;
        inner.pid = None;
        inner.started_at = Some(now_string());
        inner.last_error = None;
        inner.startup_log.clear();
        push_log_locked(&mut inner, message);
        Ok(())
    }

    fn mark_starting(
        &self,
        child: Child,
        root: PathBuf,
        config_path: PathBuf,
        command_line: String,
        node_version: String,
    ) -> Result<u32, String> {
        let pid = child.id();
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Server process state lock is poisoned".to_string())?;
        inner.child = Some(child);
        inner.pid = Some(pid);
        inner.status = ServerLifecycle::Starting;
        inner.started_at = Some(now_string());
        inner.root = Some(root.clone());
        inner.config_path = Some(config_path.clone());
        inner.last_error = None;
        push_log_locked(&mut inner, format!("Node.js detected: {node_version}"));
        push_log_locked(&mut inner, format!("Server root: {}", root.display()));
        push_log_locked(
            &mut inner,
            format!("Config path: {}", config_path.display()),
        );
        push_log_locked(&mut inner, format!("Spawn command: {command_line}"));
        push_log_locked(&mut inner, format!("Spawned server process pid={pid}."));
        Ok(pid)
    }

    fn mark_running_if_pid(&self, pid: u32) {
        if let Ok(mut inner) = self.inner.lock() {
            cleanup_exited_child_locked(&mut inner);
            if inner.pid == Some(pid) && inner.child.is_some() {
                inner.status = ServerLifecycle::Running;
                inner.last_error = None;
                push_log_locked(&mut inner, "Health check passed. Server is running.");
            }
        }
    }

    fn mark_failed(&self, error: String) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.status = ServerLifecycle::Failed;
            inner.last_error = Some(error.clone());
            inner.pid = inner.child.as_ref().map(Child::id);
            push_log_locked(&mut inner, error);
        }
    }

    fn mark_failed_if_pid(&self, pid: u32, error: String, kill_child: bool) {
        let child = {
            let Ok(mut inner) = self.inner.lock() else {
                return;
            };

            if inner.pid != Some(pid) {
                return;
            }

            inner.status = ServerLifecycle::Failed;
            inner.last_error = Some(error.clone());
            push_log_locked(&mut inner, error);

            if kill_child {
                inner.child.take()
            } else {
                None
            }
        };

        if let Some(mut child) = child {
            let _ = child.kill();
            let _ = child.wait();

            if let Ok(mut inner) = self.inner.lock() {
                if inner.pid == Some(pid) && inner.child.is_none() {
                    inner.pid = None;
                }
            }
        }
    }

    fn take_child_for_stop(&self, message: &str) -> Result<Option<(Child, u32)>, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "Server process state lock is poisoned".to_string())?;
        cleanup_exited_child_locked(&mut inner);

        if let Some(child) = inner.child.take() {
            let pid = inner.pid.unwrap_or_else(|| child.id());
            inner.pid = Some(pid);
            inner.status = ServerLifecycle::Stopping;
            push_log_locked(&mut inner, message);
            Ok(Some((child, pid)))
        } else {
            if !matches!(inner.status, ServerLifecycle::Failed) {
                inner.status = ServerLifecycle::Stopped;
            }
            inner.pid = None;
            Ok(None)
        }
    }

    fn mark_stopped_if_pid(&self, pid: u32, message: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            if inner.pid == Some(pid) || inner.pid.is_none() {
                inner.status = ServerLifecycle::Stopped;
                inner.pid = None;
                inner.child = None;
                push_log_locked(&mut inner, message);
            }
        }
    }

    fn is_pid_still_starting(&self, pid: u32) -> bool {
        let Ok(mut inner) = self.inner.lock() else {
            return false;
        };
        cleanup_exited_child_locked(&mut inner);
        inner.pid == Some(pid)
            && inner.child.is_some()
            && matches!(inner.status, ServerLifecycle::Starting)
    }
}

fn cleanup_exited_child_locked(inner: &mut ServerProcessInner) {
    let wait_result = inner.child.as_mut().map(Child::try_wait);

    match wait_result {
        Some(Ok(Some(status))) => {
            inner.child = None;
            inner.pid = None;
            match inner.status {
                ServerLifecycle::Stopping => {
                    inner.status = ServerLifecycle::Stopped;
                    push_log_locked(inner, format!("Server process stopped: {status}."));
                }
                ServerLifecycle::Starting | ServerLifecycle::Running => {
                    inner.status = ServerLifecycle::Failed;
                    let error = format!("Server process exited unexpectedly: {status}.");
                    inner.last_error = Some(error.clone());
                    push_log_locked(inner, error);
                }
                ServerLifecycle::Stopped | ServerLifecycle::Failed => {}
            }
        }
        Some(Ok(None)) => {}
        Some(Err(error)) => {
            let error = format!("Failed to inspect server process: {error}");
            inner.last_error = Some(error.clone());
            push_log_locked(inner, error);
        }
        None => {}
    }
}

fn status_from_locked(
    inner: &ServerProcessInner,
    reachable: bool,
    message: Option<String>,
) -> ServerProcessStatus {
    let managed = inner.child.is_some()
        || (inner.pid.is_some()
            && matches!(
                inner.status,
                ServerLifecycle::Starting | ServerLifecycle::Stopping
            ))
        || matches!(inner.status, ServerLifecycle::Starting);
    let (status, mode) = if !managed && reachable {
        ("external-running".to_string(), "external".to_string())
    } else if managed {
        (
            inner.status.as_str().to_string(),
            inner.status.mode().to_string(),
        )
    } else if matches!(inner.status, ServerLifecycle::Failed) {
        ("failed".to_string(), "failed".to_string())
    } else {
        ("stopped".to_string(), "stopped".to_string())
    };

    ServerProcessStatus {
        status,
        endpoint: ENDPOINT.to_string(),
        reachable,
        managed,
        running: reachable,
        pid: inner.pid,
        mode,
        message: message.or_else(|| inner.last_error.clone()),
        started_at: inner.started_at.clone(),
        last_error: inner.last_error.clone(),
        startup_log: inner.startup_log.clone(),
        root: inner.root.as_ref().map(path_to_string),
        config_path: inner.config_path.as_ref().map(path_to_string),
    }
}

fn push_log_locked(inner: &mut ServerProcessInner, message: impl Into<String>) {
    inner.startup_log.push(message.into());
    if inner.startup_log.len() > STARTUP_LOG_LIMIT {
        let overflow = inner.startup_log.len() - STARTUP_LOG_LIMIT;
        inner.startup_log.drain(0..overflow);
    }
}

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn path_to_string(path: &PathBuf) -> String {
    path.to_string_lossy().to_string()
}

fn health_check() -> Result<(), String> {
    let address: SocketAddr = HOST
        .parse()
        .map_err(|error| format!("Invalid health check address {HOST}: {error}"))?;

    let mut stream = TcpStream::connect_timeout(&address, HEALTH_TIMEOUT)
        .map_err(|error| format!("Health check connect failed: {error}"))?;

    let _ = stream.set_read_timeout(Some(HEALTH_TIMEOUT));
    let _ = stream.set_write_timeout(Some(HEALTH_TIMEOUT));

    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|error| format!("Health check write failed: {error}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("Health check read failed: {error}"))?;

    if response.starts_with("HTTP/1.1 200") && response.contains("\"name\":\"ModelGate\"") {
        Ok(())
    } else {
        Err("Health check returned a non-ModelGate response.".to_string())
    }
}

fn is_reachable() -> bool {
    health_check().is_ok()
}

fn is_development_root(path: &Path) -> bool {
    path.join("package.json").is_file() && path.join("src").join("index.ts").is_file()
}

fn is_server_runtime_root(path: &Path) -> bool {
    path.join("package.json").is_file() && path.join("dist").join("index.js").is_file()
}

fn find_development_root_from(start: &Path) -> Option<PathBuf> {
    let mut current = Some(start);

    while let Some(path) = current {
        if is_development_root(path) {
            return Some(path.to_path_buf());
        }

        current = path.parent();
    }

    None
}

fn find_server_runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(root) = env::var("MODEL_GATE_ROOT") {
        let root_path = PathBuf::from(root);
        if is_server_runtime_root(&root_path) || is_development_root(&root_path) {
            return Ok(root_path);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join(SERVER_RESOURCE_DIR);
        if is_server_runtime_root(&candidate) {
            return Ok(candidate);
        }
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            for candidate in [
                exe_dir.join(SERVER_RESOURCE_DIR),
                exe_dir
                    .parent()
                    .unwrap_or(exe_dir)
                    .join(SERVER_RESOURCE_DIR),
                exe_dir.to_path_buf(),
            ] {
                if is_server_runtime_root(&candidate) {
                    return Ok(candidate);
                }
            }
        }
    }

    if let Ok(current_dir) = env::current_dir() {
        if is_server_runtime_root(&current_dir) {
            return Ok(current_dir);
        }

        if let Some(root) = find_development_root_from(&current_dir) {
            return Ok(root);
        }
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            if let Some(root) = find_development_root_from(parent) {
                return Ok(root);
            }
        }
    }

    Err("Failed to start ModelGate server: bundled server files were not found. Please reinstall ModelGate or set MODEL_GATE_ROOT to the ModelGate project root.".to_string())
}

#[cfg(target_os = "windows")]
fn npm_command() -> &'static str {
    "npm.cmd"
}

#[cfg(not(target_os = "windows"))]
fn npm_command() -> &'static str {
    "npm"
}

fn ensure_node_available() -> Result<String, String> {
    let mut command = Command::new("node");
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);

    let mut child = command.spawn().map_err(|_| {
        "Failed to start server: Node.js is required and must be available in PATH.".to_string()
    })?;
    let started = Instant::now();

    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = child
                    .wait_with_output()
                    .map_err(|error| format!("Failed to read node --version output: {error}"))?;
                if status.success() {
                    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    return Ok(if version.is_empty() {
                        "node".to_string()
                    } else {
                        version
                    });
                }

                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                return Err(if stderr.is_empty() {
                    "Failed to start server: Node.js is required and must be available in PATH."
                        .to_string()
                } else {
                    format!("Failed to start server: node --version failed: {stderr}")
                });
            }
            Ok(None) => {
                if started.elapsed() >= NODE_CHECK_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("Failed to start server: Node.js is required and must be available in PATH.".to_string());
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Failed to check Node.js availability: {error}"));
            }
        }
    }
}

fn ensure_user_config(app: &AppHandle, root: &Path) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve ModelGate config directory: {error}"))?;
    let config_path = config_dir.join(USER_CONFIG_FILE);

    if config_path.is_file() {
        return Ok(config_path);
    }

    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("Failed to create ModelGate config directory: {error}"))?;

    let sample_config = root.join("examples").join(USER_CONFIG_FILE);
    if !sample_config.is_file() {
        return Err("Failed to start ModelGate server: bundled default config was not found. Please reinstall ModelGate or set MODEL_GATE_ROOT to the ModelGate project root.".to_string());
    }

    fs::copy(&sample_config, &config_path)
        .map_err(|error| format!("Failed to initialize ModelGate config: {error}"))?;

    Ok(config_path)
}

fn build_start_command(root: &Path) -> (Command, String) {
    let dist_entry = root.join("dist").join("index.js");

    if dist_entry.is_file() {
        let mut command = Command::new("node");
        command.arg("dist/index.js");
        (command, "node dist/index.js".to_string())
    } else {
        let mut command = Command::new(npm_command());
        command.args(["run", "dev"]);
        (command, format!("{} run dev", npm_command()))
    }
}

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console(_command: &mut Command) {}

fn begin_start(
    app: &AppHandle,
    state: &ServerProcessState,
    message: &str,
) -> Result<ServerProcessStatus, String> {
    let current = state.current_status(None)?;

    match current.status.as_str() {
        "external-running" | "starting" | "running" | "stopping" => {
            return Ok(ServerProcessStatus {
                message: Some(
                    current
                        .message
                        .unwrap_or_else(|| "Server is already active.".to_string()),
                ),
                ..current
            });
        }
        _ => {}
    }

    state.mark_preparing_start(message)?;

    let node_version = match ensure_node_available() {
        Ok(version) => version,
        Err(error) => {
            state.mark_failed(error.clone());
            return state.current_status(Some(error));
        }
    };

    let root = match find_server_runtime_root(app) {
        Ok(root) => root,
        Err(error) => {
            state.mark_failed(error.clone());
            return state.current_status(Some(error));
        }
    };

    let config_path = match ensure_user_config(app, &root) {
        Ok(path) => path,
        Err(error) => {
            state.mark_failed(error.clone());
            return state.current_status(Some(error));
        }
    };

    let (mut command, command_line) = build_start_command(&root);
    command
        .current_dir(&root)
        .env("MODELGATE_CONFIG", &config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut command);

    let child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let error = format!("Failed to spawn ModelGate server: {error}");
            state.mark_failed(error.clone());
            return state.current_status(Some(error));
        }
    };

    let pid = state.mark_starting(child, root, config_path, command_line, node_version)?;
    spawn_startup_monitor(app.clone(), pid);
    state.current_status(Some("Server is starting.".to_string()))
}

fn spawn_startup_monitor(app: AppHandle, pid: u32) {
    thread::spawn(move || {
        let started = Instant::now();

        loop {
            let health_error = match health_check() {
                Ok(()) => {
                    let state = app.state::<ServerProcessState>();
                    state.mark_running_if_pid(pid);
                    return;
                }
                Err(error) => error,
            };

            let state = app.state::<ServerProcessState>();
            if !state.is_pid_still_starting(pid) {
                return;
            }

            if started.elapsed() >= STARTUP_TIMEOUT {
                state.mark_failed_if_pid(
                    pid,
                    format!(
                        "Server startup timed out after {}s. Last health error: {last_health_error}",
                        STARTUP_TIMEOUT.as_secs(),
                        last_health_error = health_error
                    ),
                    true,
                );
                return;
            }

            thread::sleep(HEALTH_POLL_INTERVAL);
        }
    });
}

fn spawn_stop_worker(app: AppHandle, child: Child, pid: u32, restart_after_stop: bool) {
    thread::spawn(move || {
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();

        let state = app.state::<ServerProcessState>();
        state.mark_stopped_if_pid(pid, "Managed server process stopped.");

        if restart_after_stop {
            let _ = begin_start(
                &app,
                &state,
                "Restart requested. Starting server after stop.",
            );
        }
    });
}

#[tauri::command]
pub fn get_server_process_status(
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    state.current_status(None)
}

#[tauri::command]
pub async fn start_server_process(
    app: AppHandle,
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    begin_start(&app, &state, "Start requested. Preparing server process.")
}

#[tauri::command]
pub async fn stop_server_process(
    app: AppHandle,
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    let current = state.current_status(None)?;

    if current.status == "external-running" {
        return Err(
            "Server is running externally. Stop it from the terminal or process manager."
                .to_string(),
        );
    }

    if let Some((child, pid)) =
        state.take_child_for_stop("Stop requested. Stopping managed server process.")?
    {
        spawn_stop_worker(app, child, pid, false);
        return state.current_status(Some("Server is stopping.".to_string()));
    }

    state.current_status(Some("Server is stopped.".to_string()))
}

#[tauri::command]
pub async fn restart_server_process(
    app: AppHandle,
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    let current = state.current_status(None)?;

    if current.status == "external-running" {
        return Err(
            "Server is running externally. Stop it from the terminal or process manager."
                .to_string(),
        );
    }

    if matches!(current.status.as_str(), "starting" | "stopping") {
        return Ok(current);
    }

    if let Some((child, pid)) =
        state.take_child_for_stop("Restart requested. Stopping managed server process.")?
    {
        spawn_stop_worker(app, child, pid, true);
        return state.current_status(Some("Server is restarting.".to_string()));
    }

    begin_start(&app, &state, "Restart requested. Starting server process.")
}
