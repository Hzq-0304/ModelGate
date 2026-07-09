mod ccswitch_export;
mod ccswitch_import;
mod credential_store;
mod offline_config;
mod ratio_login;
mod server_process;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, Runtime, WindowEvent,
};

const TRAY_OPEN_MAIN: &str = "open-main";
const TRAY_GROUPS: &str = "groups";
const TRAY_USAGE: &str = "usage";
const TRAY_QUIT: &str = "quit";
const TRAY_NAV_EVENT: &str = "modelgate-tray-nav";

fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>, target: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    if let Some(target) = target {
        let _ = app.emit(TRAY_NAV_EVENT, target);
    }
}

fn setup_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let open_main = MenuItem::with_id(app, TRAY_OPEN_MAIN, "打开主界面", true, None::<&str>)?;
    let groups = MenuItem::with_id(app, TRAY_GROUPS, "分组选择", true, None::<&str>)?;
    let usage = MenuItem::with_id(app, TRAY_USAGE, "用量查询", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT, "\u{9000}\u{51fa}", true, None::<&str>)?;
    let separator_one = PredefinedMenuItem::separator(app)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let separator_three = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_main,
            &separator_one,
            &groups,
            &separator_two,
            &usage,
            &separator_three,
            &quit,
        ],
    )?;

    let mut tray_builder = TrayIconBuilder::with_id("modelgate-main")
        .tooltip("ModelGate")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN_MAIN => show_main_window(app, Some("main")),
            TRAY_GROUPS => show_main_window(app, Some("groups")),
            TRAY_USAGE => show_main_window(app, Some("usage")),
            TRAY_QUIT => {
                app.state::<server_process::ServerProcessState>()
                    .shutdown_managed_child();
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(server_process::ServerProcessState::default())
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ccswitch_import::detect_ccswitch_database,
            ccswitch_import::scan_ccswitch_database,
            ccswitch_import::scan_selected_ccswitch_database,
            ccswitch_export::open_ccswitch_deep_link,
            credential_store::save_ratio_credential_secret,
            ratio_login::open_ratio_login_window,
            ratio_login::capture_ratio_login_cookies,
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
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
