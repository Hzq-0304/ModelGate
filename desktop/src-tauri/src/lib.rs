mod server_process;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(server_process::ServerProcessState::default())
        .invoke_handler(tauri::generate_handler![
            server_process::get_server_process_status,
            server_process::start_server_process,
            server_process::stop_server_process,
            server_process::restart_server_process
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let state = window.state::<server_process::ServerProcessState>();
                state.stop_managed_child();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
