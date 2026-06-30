use serde::Serialize;
use std::{
    env,
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};

const ENDPOINT: &str = "http://127.0.0.1:11435";
const HOST: &str = "127.0.0.1:11435";
const SERVER_RESOURCE_DIR: &str = "modelgate-server";
const USER_CONFIG_FILE: &str = "modelgate.config.yaml";

#[derive(Default)]
pub struct ServerProcessState {
    child: Mutex<Option<Child>>,
}

impl ServerProcessState {
    pub fn stop_managed_child(&self) {
        if let Ok(mut child_slot) = self.child.lock() {
            if let Some(mut child) = child_slot.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    fn cleanup_exited_child(&self) -> Result<Option<u32>, String> {
        let mut child_slot = self
            .child
            .lock()
            .map_err(|_| "Server process state lock is poisoned".to_string())?;

        if let Some(child) = child_slot.as_mut() {
            match child.try_wait() {
                Ok(Some(_status)) => {
                    *child_slot = None;
                    Ok(None)
                }
                Ok(None) => Ok(child_slot.as_ref().map(Child::id)),
                Err(error) => Err(format!("Failed to inspect server process: {error}")),
            }
        } else {
            Ok(None)
        }
    }
}

#[derive(Serialize)]
pub struct ServerProcessStatus {
    endpoint: String,
    reachable: bool,
    managed: bool,
    running: bool,
    pid: Option<u32>,
    mode: String,
    message: Option<String>,
}

fn is_reachable() -> bool {
    let address: SocketAddr = match HOST.parse() {
        Ok(address) => address,
        Err(_) => return false,
    };

    let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(350)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(350)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(350)));

    if stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") && response.contains("\"name\":\"ModelGate\"")
}

fn status_from_parts(pid: Option<u32>, message: Option<String>) -> ServerProcessStatus {
    let reachable = is_reachable();
    let managed = pid.is_some();
    let mode = match (reachable, managed) {
        (true, true) => "managed",
        (true, false) => "external",
        (false, true) => "unknown",
        (false, false) => "stopped",
    };

    ServerProcessStatus {
        endpoint: ENDPOINT.to_string(),
        reachable,
        managed,
        running: reachable,
        pid,
        mode: mode.to_string(),
        message,
    }
}

fn get_status(state: &ServerProcessState, message: Option<String>) -> Result<ServerProcessStatus, String> {
    let pid = state.cleanup_exited_child()?;
    Ok(status_from_parts(pid, message))
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

    if let Ok(current_exe) = env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            for candidate in [
                exe_dir.join(SERVER_RESOURCE_DIR),
                exe_dir.parent().unwrap_or(exe_dir).join(SERVER_RESOURCE_DIR),
                exe_dir.to_path_buf(),
            ] {
                if is_server_runtime_root(&candidate) {
                    return Ok(candidate);
                }
            }
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidate = resource_dir.join(SERVER_RESOURCE_DIR);
        if is_server_runtime_root(&candidate) {
            return Ok(candidate);
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

fn ensure_node_available() -> Result<(), String> {
    let mut command = Command::new("node");
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut command);

    command
        .status()
        .map_err(|_| "Failed to start ModelGate server: this release requires Node.js to be installed and available in PATH.".to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("Failed to start ModelGate server: this release requires Node.js to be installed and available in PATH.".to_string())
            }
        })
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

fn build_start_command(root: &Path) -> Command {
    let dist_entry = root.join("dist").join("index.js");

    if dist_entry.is_file() {
        let mut command = Command::new("node");
        command.arg("dist/index.js");
        command
    } else {
        let mut command = Command::new(npm_command());
        command.args(["run", "dev"]);
        command
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

#[tauri::command]
pub fn get_server_process_status(
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    get_status(&state, None)
}

#[tauri::command]
pub fn start_server_process(
    app: AppHandle,
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    let current = get_status(&state, None)?;

    if current.reachable && !current.managed {
        return Ok(status_from_parts(
            None,
            Some("Server is already running externally.".to_string()),
        ));
    }

    if current.managed {
        return Ok(current);
    }

    ensure_node_available()?;
    let root = find_server_runtime_root(&app)?;
    let config_path = ensure_user_config(&app, &root)?;
    let mut command = build_start_command(&root);
    command
        .current_dir(&root)
        .env("MODELGATE_CONFIG", config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_console(&mut command);

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start ModelGate server: {error}"))?;
    let pid = child.id();

    {
        let mut child_slot = state
            .child
            .lock()
            .map_err(|_| "Server process state lock is poisoned".to_string())?;
        *child_slot = Some(child);
    }

    for _ in 0..40 {
        if is_reachable() {
            return Ok(status_from_parts(
                Some(pid),
                Some("Server started".to_string()),
            ));
        }

        thread::sleep(Duration::from_millis(250));
    }

    state.stop_managed_child();
    Err("Server process started but /health did not become reachable.".to_string())
}

#[tauri::command]
pub fn stop_server_process(
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    let current = get_status(&state, None)?;

    if current.reachable && !current.managed {
        return Err("Server is running externally. Stop it from the terminal or process manager.".to_string());
    }

    if current.managed {
        state.stop_managed_child();

        for _ in 0..20 {
            if !is_reachable() {
                break;
            }

            thread::sleep(Duration::from_millis(150));
        }
    }

    get_status(&state, Some("Server stopped".to_string()))
}

#[tauri::command]
pub fn restart_server_process(
    app: AppHandle,
    state: State<'_, ServerProcessState>,
) -> Result<ServerProcessStatus, String> {
    let current = get_status(&state, None)?;

    if current.reachable && !current.managed {
        return Err("Server is running externally. Stop it from the terminal or process manager.".to_string());
    }

    if current.managed {
        state.stop_managed_child();
        for _ in 0..20 {
            if !is_reachable() {
                break;
            }

            thread::sleep(Duration::from_millis(150));
        }
    }

    let mut status = start_server_process(app, state)?;
    status.message = Some("Server restarted".to_string());
    Ok(status)
}
