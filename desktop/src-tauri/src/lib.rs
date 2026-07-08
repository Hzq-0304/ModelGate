mod ccswitch_import;
mod ccswitch_export;
mod credential_store;
mod offline_config;
mod server_process;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(server_process::ServerProcessState::default())
        .invoke_handler(tauri::generate_handler![
            ccswitch_import::detect_ccswitch_database,
            ccswitch_import::scan_ccswitch_database,
            ccswitch_import::scan_selected_ccswitch_database,
            ccswitch_export::open_ccswitch_deep_link,
            credential_store::save_ratio_credential_secret,
            offline_config::get_modelgate_config_path,
            offline_config::read_modelgate_config,
            offline_config::read_ratio_data,
            offline_config::read_usage_data,
            offline_config::write_modelgate_config,
            offline_config::merge_ccswitch_import_into_config,
            offline_config::validate_modelgate_config_offline,
            offline_config::check_environment_variables,
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
