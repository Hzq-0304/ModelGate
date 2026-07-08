use serde::Serialize;
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const USER_CONFIG_FILE: &str = "modelgate.config.yaml";
const SERVER_RESOURCE_DIR: &str = "modelgate-server";

#[derive(Serialize)]
pub struct OfflineConfigTextResponse {
    path: String,
    raw: String,
}

#[derive(Serialize)]
pub struct OfflineConfigWriteResponse {
    ok: bool,
    errors: Vec<String>,
    warnings: Vec<String>,
    path: String,
}

#[derive(Serialize)]
pub struct OfflineRatioDataResponse {
    root: String,
    sources_raw: String,
    cache_raw: String,
}

#[derive(Serialize)]
pub struct OfflineUsageDataResponse {
    path: String,
    raw: String,
}

#[derive(Serialize)]
pub struct OfflineValidationResponse {
    ok: bool,
    errors: Vec<String>,
    warnings: Vec<String>,
}

#[tauri::command]
pub fn get_modelgate_config_path(app: AppHandle) -> Result<String, String> {
    Ok(path_to_string(&resolve_modelgate_config_path(&app)?))
}

#[tauri::command]
pub fn read_modelgate_config(app: AppHandle) -> Result<OfflineConfigTextResponse, String> {
    let config_path = ensure_modelgate_config(&app)?;
    let raw = fs::read_to_string(&config_path)
        .map_err(|error| format!("Failed to read ModelGate config: {error}"))?;

    Ok(OfflineConfigTextResponse {
        path: path_to_string(&config_path),
        raw,
    })
}

#[tauri::command]
pub fn read_ratio_data(app: AppHandle) -> Result<OfflineRatioDataResponse, String> {
    let root = resolve_ratio_data_dir(&app)?;
    let sources_path = root.join("sources.json");
    let cache_path = root.join("cache.json");
    let sources_raw = fs::read_to_string(&sources_path)
        .unwrap_or_else(|_| "{\"schema_version\":1,\"sources\":[]}".to_string());
    let cache_raw = fs::read_to_string(&cache_path)
        .unwrap_or_else(|_| "{\"schema_version\":1,\"entries\":{}}".to_string());

    Ok(OfflineRatioDataResponse {
        root: path_to_string(&root),
        sources_raw,
        cache_raw,
    })
}

#[tauri::command]
pub fn read_usage_data(app: AppHandle) -> Result<OfflineUsageDataResponse, String> {
    let usage_path = resolve_usage_path(&app)?;
    let raw = fs::read_to_string(&usage_path).unwrap_or_default();

    Ok(OfflineUsageDataResponse {
        path: path_to_string(&usage_path),
        raw,
    })
}


#[tauri::command]
pub fn write_modelgate_config(
    app: AppHandle,
    raw: String,
) -> Result<OfflineConfigWriteResponse, String> {
    let config_path = ensure_modelgate_config(&app)?;
    let validation = validate_raw_config(&raw);

    if !validation.ok {
        return Ok(OfflineConfigWriteResponse {
            ok: false,
            errors: validation.errors,
            warnings: validation.warnings,
            path: path_to_string(&config_path),
        });
    }

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create ModelGate config directory: {error}"))?;
    }

    fs::write(&config_path, raw)
        .map_err(|error| format!("Failed to write ModelGate config: {error}"))?;

    Ok(OfflineConfigWriteResponse {
        ok: true,
        errors: Vec::new(),
        warnings: validation.warnings,
        path: path_to_string(&config_path),
    })
}

#[tauri::command]
pub fn validate_modelgate_config_offline(raw: String) -> OfflineValidationResponse {
    validate_raw_config(&raw)
}

#[tauri::command]
pub fn check_environment_variables(names: Vec<String>) -> HashMap<String, bool> {
    names
        .into_iter()
        .map(|name| {
            let exists = env::var_os(&name).is_some();
            (name, exists)
        })
        .collect()
}

#[tauri::command]
pub fn merge_ccswitch_import_into_config(
    app: AppHandle,
    raw: String,
) -> Result<OfflineConfigTextResponse, String> {
    let result = write_modelgate_config(app.clone(), raw)?;
    if !result.ok {
        return Err(result.errors.join(" "));
    }

    read_modelgate_config(app)
}

fn validate_raw_config(raw: &str) -> OfflineValidationResponse {
    let errors = if raw.trim().is_empty() {
        vec!["Config YAML cannot be empty.".to_string()]
    } else {
        Vec::new()
    };

    OfflineValidationResponse {
        ok: errors.is_empty(),
        errors,
        warnings: Vec::new(),
    }
}

fn resolve_modelgate_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    for name in ["MODELGATE_CONFIG", "MODEL_GATE_CONFIG"] {
        if let Ok(value) = env::var(name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(absolutize(PathBuf::from(trimmed)));
            }
        }
    }

    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve ModelGate config directory: {error}"))?;
    Ok(config_dir.join(USER_CONFIG_FILE))
}

fn resolve_ratio_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(value) = env::var("MODELGATE_RATIO_DIR") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(absolutize(PathBuf::from(trimmed)));
        }
    }

    if let Ok(value) = env::var("MODELGATE_DATA_DIR") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(absolutize(PathBuf::from(trimmed)).join("ratio"));
        }
    }

    let config_path = resolve_modelgate_config_path(app)?;
    Ok(config_path
        .parent()
        .map(|parent| parent.join("ratio"))
        .unwrap_or_else(|| PathBuf::from("ratio")))
}

fn resolve_usage_path(app: &AppHandle) -> Result<PathBuf, String> {
    for name in ["MODELGATE_USAGE_PATH", "MODEL_GATE_USAGE_PATH"] {
        if let Ok(value) = env::var(name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(absolutize(PathBuf::from(trimmed)));
            }
        }
    }

    let mut candidates = Vec::new();

    if let Ok(value) = env::var("MODELGATE_DATA_DIR") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            candidates.push(absolutize(PathBuf::from(trimmed)).join("usage.jsonl"));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(
            resource_dir
                .join(SERVER_RESOURCE_DIR)
                .join(".modelgate")
                .join("usage.jsonl"),
        );
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(
                parent
                    .join(SERVER_RESOURCE_DIR)
                    .join(".modelgate")
                    .join("usage.jsonl"),
            );
        }
    }

    if let Ok(current_dir) = env::current_dir() {
        candidates.push(current_dir.join(".modelgate").join("usage.jsonl"));
        add_parent_usage_candidates(&mut candidates, &current_dir);
    }

    if let Ok(config_path) = resolve_modelgate_config_path(app) {
        if let Some(parent) = config_path.parent() {
            candidates.push(parent.join(".modelgate").join("usage.jsonl"));
        }
    }

    Ok(candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .unwrap_or_else(|| PathBuf::from(".modelgate").join("usage.jsonl")))
}

fn add_parent_usage_candidates(candidates: &mut Vec<PathBuf>, start: &Path) {
    let mut current = Some(start);
    while let Some(path) = current {
        candidates.push(path.join(".modelgate").join("usage.jsonl"));
        candidates.push(
            path.join("desktop")
                .join("src-tauri")
                .join("resources")
                .join(SERVER_RESOURCE_DIR)
                .join(".modelgate")
                .join("usage.jsonl"),
        );
        current = path.parent();
    }
}


fn ensure_modelgate_config(app: &AppHandle) -> Result<PathBuf, String> {
    let config_path = resolve_modelgate_config_path(app)?;
    if config_path.is_file() {
        return Ok(config_path);
    }

    let sample = find_sample_config(app)?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create ModelGate config directory: {error}"))?;
    }
    fs::copy(&sample, &config_path)
        .map_err(|error| format!("Failed to initialize ModelGate config: {error}"))?;

    Ok(config_path)
}

fn find_sample_config(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(
            resource_dir
                .join(SERVER_RESOURCE_DIR)
                .join("examples")
                .join(USER_CONFIG_FILE),
        );
        candidates.push(resource_dir.join("examples").join(USER_CONFIG_FILE));
    }

    if let Ok(current_dir) = env::current_dir() {
        add_parent_sample_candidates(&mut candidates, &current_dir);
    }

    if let Ok(current_exe) = env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            add_parent_sample_candidates(&mut candidates, parent);
            candidates.push(
                parent
                    .join(SERVER_RESOURCE_DIR)
                    .join("examples")
                    .join(USER_CONFIG_FILE),
            );
        }
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            "Bundled default ModelGate config was not found. Reinstall ModelGate or set MODELGATE_CONFIG.".to_string()
        })
}

fn add_parent_sample_candidates(candidates: &mut Vec<PathBuf>, start: &Path) {
    let mut current = Some(start);
    while let Some(path) = current {
        candidates.push(path.join("examples").join(USER_CONFIG_FILE));
        candidates.push(
            path.join("desktop")
                .join("src-tauri")
                .join("resources")
                .join(SERVER_RESOURCE_DIR)
                .join("examples")
                .join(USER_CONFIG_FILE),
        );
        current = path.parent();
    }
}

fn absolutize(path: PathBuf) -> PathBuf {
    if path.is_absolute() {
        return path;
    }

    env::current_dir()
        .map(|current_dir| current_dir.join(path.clone()))
        .unwrap_or(path)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}
