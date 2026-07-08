use serde::Serialize;
use std::{
    env, fs,
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, ChildStderr, Command, ExitStatus, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

use crate::credential_store;

const ENDPOINT: &str = "http://127.0.0.1:11435";
const HOST: &str = "127.0.0.1:11435";
const SERVER_RESOURCE_DIR: &str = "modelgate-server";
const SERVER_BUNDLE_FILE: &str = "modelgate-server.cjs";
const USER_CONFIG_FILE: &str = "modelgate.config.yaml";
const HEALTH_TIMEOUT: Duration = Duration::from_millis(800);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const NODE_CHECK_TIMEOUT: Duration = Duration::from_millis(1500);
const STARTUP_LOG_LIMIT: usize = 32;
const STDERR_LOG_LIMIT: usize = 100;
const NODE_MISSING_ERROR: &str = "Failed to start ModelGate server: this release requires Node.js to be installed and available in PATH.";
const EXTERNAL_STOP_UNAVAILABLE: &str =
    "This server was not started by the desktop app and cannot be stopped here.";

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
    recent_stderr: Vec<String>,
    root: Option<PathBuf>,
    config_path: Option<PathBuf>,
    command: Option<String>,
    exit_code: Option<String>,
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
    can_stop: bool,
    running: bool,
    pid: Option<u32>,
    mode: String,
    message: Option<String>,
    started_at: Option<String>,
    last_error: Option<String>,
    startup_log: Vec<String>,
    recent_stderr: Vec<String>,
    root: Option<String>,
    config_path: Option<String>,
    command: Option<String>,
    exit_code: Option<String>,
}

impl ServerProcessState {
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
        inner.recent_stderr.clear();
        inner.root = None;
        inner.config_path = None;
        inner.command = None;
        inner.exit_code = None;
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
        inner.command = Some(command_line.clone());
        inner.exit_code = None;
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
                inner.exit_code = None;
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

    fn mark_failed_if_pid(
        &self,
        pid: u32,
        error: String,
        kill_child: bool,
        exit_code: Option<String>,
    ) {
        let child = {
            let Ok(mut inner) = self.inner.lock() else {
                return;
            };

            if inner.pid != Some(pid) {
                return;
            }

            inner.status = ServerLifecycle::Failed;
            inner.last_error = Some(error.clone());
            if exit_code.is_some() {
                inner.exit_code = exit_code.clone();
            }
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
                    inner.pid = Some(pid);
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
                inner.exit_code = None;
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

    fn append_stderr_if_pid(&self, pid: u32, line: String) {
        if let Ok(mut inner) = self.inner.lock() {
            if inner.pid != Some(pid) {
                return;
            }

            inner.recent_stderr.push(line);
            trim_lines(&mut inner.recent_stderr, STDERR_LOG_LIMIT);
        }
    }
}

fn cleanup_exited_child_locked(inner: &mut ServerProcessInner) {
    let wait_result = inner.child.as_mut().map(Child::try_wait);

    match wait_result {
        Some(Ok(Some(status))) => {
            let previous_pid = inner.pid;
            inner.child = None;
            let exit_code = exit_status_to_string(status);
            inner.exit_code = Some(exit_code.clone());
            match inner.status {
                ServerLifecycle::Stopping => {
                    inner.pid = None;
                    inner.status = ServerLifecycle::Stopped;
                    push_log_locked(inner, format!("Server process stopped: {exit_code}."));
                }
                ServerLifecycle::Starting | ServerLifecycle::Running => {
                    inner.pid = previous_pid;
                    inner.status = ServerLifecycle::Failed;
                    let stderr = summarize_recent_stderr(&inner.recent_stderr);
                    let error = format!(
                        "Server process exited unexpectedly: {exit_code}.{stderr}"
                    );
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
    let can_stop = managed
        && inner.child.is_some()
        && matches!(
            inner.status,
            ServerLifecycle::Starting | ServerLifecycle::Running
        );

    ServerProcessStatus {
        status,
        endpoint: ENDPOINT.to_string(),
        reachable,
        managed,
        can_stop,
        running: reachable,
        pid: inner.pid,
        mode,
        message: message.or_else(|| inner.last_error.clone()),
        started_at: inner.started_at.clone(),
        last_error: inner.last_error.clone(),
        startup_log: inner.startup_log.clone(),
        recent_stderr: inner.recent_stderr.clone(),
        root: inner.root.as_ref().map(path_to_string),
        config_path: inner.config_path.as_ref().map(path_to_string),
        command: inner.command.clone(),
        exit_code: inner.exit_code.clone(),
    }
}

fn push_log_locked(inner: &mut ServerProcessInner, message: impl Into<String>) {
    inner.startup_log.push(message.into());
    trim_lines(&mut inner.startup_log, STARTUP_LOG_LIMIT);
}

fn trim_lines(lines: &mut Vec<String>, limit: usize) {
    if lines.len() > limit {
        let overflow = lines.len() - limit;
        lines.drain(0..overflow);
    }
}

fn exit_status_to_string(status: ExitStatus) -> String {
    status
        .code()
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| status.to_string())
}

fn summarize_recent_stderr(lines: &[String]) -> String {
    if lines.is_empty() {
        String::new()
    } else {
        format!(" Recent stderr: {}", lines.join(" | "))
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

fn has_server_bundle(path: &Path) -> bool {
    path.join(SERVER_BUNDLE_FILE).is_file()
        || path
            .join("dist-server")
            .join(SERVER_BUNDLE_FILE)
            .is_file()
}

fn is_server_runtime_root(path: &Path) -> bool {
    path.join("package.json").is_file()
        && (has_server_bundle(path) || path.join("dist").join("index.js").is_file())
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
    for env_name in ["MODELGATE_ROOT", "MODEL_GATE_ROOT"] {
        if let Ok(root) = env::var(env_name) {
            let root_path = PathBuf::from(root);
            if is_server_runtime_root(&root_path) || is_development_root(&root_path) {
                return Ok(root_path);
            }
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

    Err("Failed to start ModelGate server: bundled server files were not found. Please reinstall ModelGate or set MODELGATE_ROOT to the ModelGate project root or server runtime directory.".to_string())
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

    let mut child = command
        .spawn()
        .map_err(|_| NODE_MISSING_ERROR.to_string())?;
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
                    NODE_MISSING_ERROR.to_string()
                } else {
                    format!("Failed to start server: node --version failed: {stderr}")
                });
            }
            Ok(None) => {
                if started.elapsed() >= NODE_CHECK_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(NODE_MISSING_ERROR.to_string());
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
        return Err("Failed to start ModelGate server: bundled default config was not found. Please reinstall ModelGate or set MODELGATE_ROOT to the ModelGate project root.".to_string());
    }

    fs::copy(&sample_config, &config_path)
        .map_err(|error| format!("Failed to initialize ModelGate config: {error}"))?;

    Ok(config_path)
}

fn build_start_command(root: &Path) -> (Command, String) {
    let bundle_entry = root.join(SERVER_BUNDLE_FILE);
    let dev_bundle_entry = root.join("dist-server").join(SERVER_BUNDLE_FILE);
    let dist_entry = root.join("dist").join("index.js");

    if bundle_entry.is_file() {
        let mut command = Command::new("node");
        command.arg(SERVER_BUNDLE_FILE);
        (command, format!("node {SERVER_BUNDLE_FILE}"))
    } else if dev_bundle_entry.is_file() {
        let mut command = Command::new("node");
        command.arg(format!("dist-server/{SERVER_BUNDLE_FILE}"));
        (command, format!("node dist-server/{SERVER_BUNDLE_FILE}"))
    } else if dist_entry.is_file() {
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
    let config_dir = config_path
        .parent()
        .map(|path| path.to_path_buf())
        .unwrap_or_else(|| root.clone());
    command
        .current_dir(&root)
        .env("MODELGATE_CONFIG", &config_path)
        .env("MODEL_GATE_CONFIG", &config_path)
        .env("MODELGATE_CONFIG_DIR", &config_dir)
        .env("MODEL_GATE_CONFIG_DIR", &config_dir)
        .env("MODELGATE_SNAPSHOT_DIR", &config_dir)
        .env("MODEL_GATE_SNAPSHOT_DIR", &config_dir)
        .env("MODELGATE_ROUTING_ENABLED", "false");
    for (env_name, secret) in credential_store::saved_ratio_credentials(app) {
        command.env(env_name, secret);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    hide_console(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let error = format!("Failed to spawn ModelGate server: {error}");
            state.mark_failed(error.clone());
            return state.current_status(Some(error));
        }
    };

    let stderr = child.stderr.take();
    let pid = state.mark_starting(child, root, config_path, command_line, node_version)?;
    if let Some(stderr) = stderr {
        spawn_stderr_reader(app.clone(), pid, stderr);
    }
    spawn_startup_monitor(app.clone(), pid);
    state.current_status(Some("Server is starting.".to_string()))
}

fn spawn_stderr_reader(app: AppHandle, pid: u32, stderr: ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let state = app.state::<ServerProcessState>();
                    state.append_stderr_if_pid(pid, line);
                }
                Err(error) => {
                    let state = app.state::<ServerProcessState>();
                    state.append_stderr_if_pid(pid, format!("Failed to read stderr: {error}"));
                    return;
                }
            }
        }
    });
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
                    Some("startup timeout".to_string()),
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
        return Ok(ServerProcessStatus {
            message: Some(EXTERNAL_STOP_UNAVAILABLE.to_string()),
            ..current
        });
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
        return Ok(ServerProcessStatus {
            message: Some(EXTERNAL_STOP_UNAVAILABLE.to_string()),
            ..current
        });
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
