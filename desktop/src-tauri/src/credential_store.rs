use serde::{Deserialize, Serialize};
use std::{collections::BTreeSet, fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const SCHEMA_VERSION: u8 = 1;
const TARGET_PREFIX: &str = "ModelGate/RatioCredential/";
const REGISTRY_FILE: &str = "ratio-credentials.json";

#[derive(Debug, Deserialize, Serialize)]
struct CredentialRegistry {
    schema_version: u8,
    entries: Vec<String>,
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create app data directory: {error}"))?;
    Ok(dir.join(REGISTRY_FILE))
}

fn read_registry(app: &AppHandle) -> Result<CredentialRegistry, String> {
    let path = registry_path(app)?;
    if !path.is_file() {
        return Ok(CredentialRegistry {
            schema_version: SCHEMA_VERSION,
            entries: Vec::new(),
        });
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read credential registry: {error}"))?;
    let mut registry = serde_json::from_str::<CredentialRegistry>(&raw)
        .map_err(|error| format!("Failed to parse credential registry: {error}"))?;
    registry.entries.sort();
    registry.entries.dedup();
    Ok(registry)
}

fn write_registry(app: &AppHandle, registry: &CredentialRegistry) -> Result<(), String> {
    let path = registry_path(app)?;
    let raw = serde_json::to_string_pretty(registry)
        .map_err(|error| format!("Failed to serialize credential registry: {error}"))?;
    fs::write(path, format!("{raw}\n"))
        .map_err(|error| format!("Failed to write credential registry: {error}"))
}

fn remember_env_name(app: &AppHandle, env_name: &str) -> Result<(), String> {
    let registry = read_registry(app)?;
    let mut entries = registry.entries.into_iter().collect::<BTreeSet<_>>();
    entries.insert(env_name.to_string());
    write_registry(
        app,
        &CredentialRegistry {
            schema_version: SCHEMA_VERSION,
            entries: entries.into_iter().collect(),
        },
    )
}

fn target_name(env_name: &str) -> String {
    format!("{TARGET_PREFIX}{env_name}")
}

#[cfg(target_os = "windows")]
mod platform {
    use super::target_name;
    use std::{ffi::c_void, io, ptr::null_mut, slice};
    use windows_sys::Win32::{
        Foundation::ERROR_NOT_FOUND,
        Security::Credentials::{
            CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
            CRED_TYPE_GENERIC,
        },
    };

    fn to_wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn write_secret(env_name: &str, secret: &str) -> Result<(), String> {
        let target = to_wide(&target_name(env_name));
        let username = to_wide("ModelGate");
        let mut blob = secret.as_bytes().to_vec();
        let credential = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_ptr() as *mut u16,
            Comment: null_mut(),
            LastWritten: Default::default(),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: null_mut(),
            TargetAlias: null_mut(),
            UserName: username.as_ptr() as *mut u16,
        };

        let ok = unsafe { CredWriteW(&credential, 0) };
        if ok == 0 {
            return Err(format!(
                "Failed to save credential: {}",
                io::Error::last_os_error()
            ));
        }
        Ok(())
    }

    pub fn read_secret(env_name: &str) -> Result<Option<String>, String> {
        let target = to_wide(&target_name(env_name));
        let mut credential: *mut CREDENTIALW = null_mut();
        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut credential) };
        if ok == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() == Some(ERROR_NOT_FOUND as i32) {
                return Ok(None);
            }
            return Err(format!("Failed to read credential: {error}"));
        }

        let result = unsafe {
            let credential_ref = &*credential;
            let bytes = slice::from_raw_parts(
                credential_ref.CredentialBlob,
                credential_ref.CredentialBlobSize as usize,
            );
            String::from_utf8(bytes.to_vec())
                .map(Some)
                .map_err(|error| format!("Stored credential is not valid UTF-8: {error}"))
        };
        unsafe {
            CredFree(credential as *const c_void);
        }
        result
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn write_secret(_env_name: &str, _secret: &str) -> Result<(), String> {
        Err("Persistent credential storage is only available on Windows.".to_string())
    }

    pub fn read_secret(_env_name: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
}

#[tauri::command]
pub fn save_ratio_credential_secret(
    app: AppHandle,
    env_name: String,
    secret: String,
) -> Result<(), String> {
    let env_name = env_name.trim();
    if env_name.is_empty() || secret.is_empty() {
        return Err("Credential name and value are required.".to_string());
    }

    platform::write_secret(env_name, &secret)?;
    remember_env_name(&app, env_name)
}

pub fn saved_ratio_credentials(app: &AppHandle) -> Vec<(String, String)> {
    let Ok(registry) = read_registry(app) else {
        return Vec::new();
    };

    registry
        .entries
        .into_iter()
        .filter_map(|env_name| match platform::read_secret(&env_name) {
            Ok(Some(secret)) if !secret.is_empty() => Some((env_name, secret)),
            _ => None,
        })
        .collect()
}
