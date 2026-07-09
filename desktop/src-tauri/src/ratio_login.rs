use serde::Serialize;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const RATIO_LOGIN_WINDOW_LABEL: &str = "ratio-login";

#[derive(Serialize)]
pub struct RatioLoginCookieResponse {
    cookie: String,
    count: usize,
}

fn normalize_login_url(base_url: &str) -> Result<Url, String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err("Ratio source site URL is required.".to_string());
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    let mut url = Url::parse(&candidate)
        .map_err(|error| format!("Invalid ratio source site URL: {error}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Ratio source site URL must use http or https.".to_string());
    }

    url.set_query(None);
    Ok(url)
}

#[tauri::command]
pub fn open_ratio_login_window(app: AppHandle, base_url: String) -> Result<(), String> {
    let url = normalize_login_url(&base_url)?;

    if let Some(window) = app.get_webview_window(RATIO_LOGIN_WINDOW_LABEL) {
        window
            .navigate(url)
            .map_err(|error| format!("Failed to navigate login window: {error}"))?;
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        RATIO_LOGIN_WINDOW_LABEL,
        WebviewUrl::External(url),
    )
    .title("ModelGate Login")
    .inner_size(1040.0, 760.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|error| format!("Failed to open login window: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn capture_ratio_login_cookies(
    app: AppHandle,
    base_url: String,
) -> Result<RatioLoginCookieResponse, String> {
    let url = normalize_login_url(&base_url)?;
    let window = app
        .get_webview_window(RATIO_LOGIN_WINDOW_LABEL)
        .ok_or_else(|| "Open the login window first, then complete login on the site.".to_string())?;

    let cookies = window
        .cookies_for_url(url)
        .map_err(|error| format!("Failed to read login cookies: {error}"))?;
    let pairs = cookies
        .iter()
        .filter_map(|cookie| {
            let name = cookie.name().trim();
            let value = cookie.value().trim();
            (!name.is_empty() && !value.is_empty()).then(|| format!("{name}={value}"))
        })
        .collect::<Vec<_>>();

    if pairs.is_empty() {
        return Err("No login cookies were found. Complete login in the login window first.".to_string());
    }

    Ok(RatioLoginCookieResponse {
        cookie: pairs.join("; "),
        count: pairs.len(),
    })
}
