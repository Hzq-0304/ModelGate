use std::process::Command;

#[tauri::command]
pub fn open_ccswitch_deep_link(url: String) -> Result<String, String> {
    if !url.starts_with("ccswitch://v1/import?") {
        return Err("Only ccswitch://v1/import deep links are allowed.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("rundll32")
            .arg("url.dll,FileProtocolHandler")
            .arg(&url)
            .status()
            .map_err(|error| {
                format!("CC Switch protocol is not registered. Please install or reopen CC Switch. {error}")
            })?;

        if status.success() {
            Ok("CC Switch deep link opened.".to_string())
        } else {
            Err("CC Switch protocol is not registered. Please install or reopen CC Switch.".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = url;
        Err("Opening CC Switch deep links is currently supported on Windows desktop builds.".to_string())
    }
}
