use rusqlite::{
    types::ValueRef,
    Connection, OpenFlags,
};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    env,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
pub struct CcSwitchDatabaseDetection {
    found: bool,
    path: Option<String>,
    message: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct CcSwitchImportCandidate {
    id: String,
    source_table: Option<String>,
    source_id: Option<String>,
    name: String,
    provider_name: String,
    provider_type: String,
    base_url: Option<String>,
    api_key_env: Option<String>,
    api_key_detected: bool,
    api_key_preview: Option<String>,
    model: Option<String>,
    models: Vec<String>,
    suggested_modelgate_provider: String,
    suggested_modelgate_alias: String,
    suggested_env_name: String,
    complete: bool,
    warnings: Vec<String>,
}

#[derive(Serialize)]
pub struct CcSwitchScanResult {
    path: String,
    candidates: Vec<CcSwitchImportCandidate>,
    warnings: Vec<String>,
}

const NAME_KEYS: &[&str] = &["name", "label", "display_name", "title", "provider_name"];
const BASE_URL_KEYS: &[&str] = &["base_url", "baseurl", "api_base", "apibase", "endpoint", "url", "base"];
const API_KEY_KEYS: &[&str] = &["api_key", "apikey", "key", "token", "auth_token"];
const MODEL_KEYS: &[&str] = &[
    "model",
    "model_name",
    "modelname",
    "default_model",
    "defaultmodel",
    "codex_model",
    "models",
];
const TYPE_KEYS: &[&str] = &["type", "api_type", "protocol", "kind"];

#[tauri::command]
pub fn detect_ccswitch_database() -> CcSwitchDatabaseDetection {
    let path = default_database_path();

    if path.is_file() {
        CcSwitchDatabaseDetection {
            found: true,
            path: Some(path.to_string_lossy().to_string()),
            message: None,
        }
    } else {
        CcSwitchDatabaseDetection {
            found: false,
            path: None,
            message: Some("CC Switch database was not found automatically.".to_string()),
        }
    }
}

#[tauri::command]
pub fn scan_ccswitch_database() -> Result<CcSwitchScanResult, String> {
    scan_database(&default_database_path())
}

#[tauri::command]
pub fn scan_selected_ccswitch_database(path: String) -> Result<CcSwitchScanResult, String> {
    scan_database(Path::new(&path))
}

fn default_database_path() -> PathBuf {
    let home = env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    home.join(".cc-switch").join("cc-switch.db")
}

fn scan_database(path: &Path) -> Result<CcSwitchScanResult, String> {
    if !path.is_file() {
        return Err(format!("CC Switch database not found: {}", path.display()));
    }

    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("Failed to open SQLite database read-only: {error}"))?;

    let mut warnings = Vec::new();
    let tables = list_tables(&connection)?;
    let mut candidates = Vec::new();

    for table in tables {
        if !is_candidate_table(&table) {
            continue;
        }

        match scan_table(&connection, &table) {
            Ok(mut table_candidates) => candidates.append(&mut table_candidates),
            Err(error) => warnings.push(format!("Failed to scan table {table}: {error}")),
        }
    }

    dedupe_candidates(&mut candidates);

    if candidates.is_empty() {
        warnings.push("No provider candidates were found. The CC Switch schema may be unsupported.".to_string());
    }

    Ok(CcSwitchScanResult {
        path: path.to_string_lossy().to_string(),
        candidates,
        warnings,
    })
}

fn list_tables(connection: &Connection) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut tables = Vec::new();
    for row in rows {
        tables.push(row.map_err(|error| error.to_string())?);
    }
    Ok(tables)
}

fn is_candidate_table(table: &str) -> bool {
    let name = table.to_lowercase();
    name == "providers"
        || name == "provider_endpoints"
        || name.contains("provider")
        || name.contains("endpoint")
        || name.contains("model")
}

fn scan_table(connection: &Connection, table: &str) -> Result<Vec<CcSwitchImportCandidate>, String> {
    let sql = format!("SELECT * FROM {} LIMIT 100", quote_identifier(table));
    let mut statement = connection.prepare(&sql).map_err(|error| error.to_string())?;
    let column_names = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    let mut candidates = Vec::new();
    let mut row_index = 0usize;

    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let mut fields = HashMap::new();

        for (index, name) in column_names.iter().enumerate() {
            let value = value_to_string(row.get_ref(index).map_err(|error| error.to_string())?);
            if let Some(value) = value {
                insert_field(&mut fields, name, value.clone());
                collect_json_fields(&mut fields, &value);
            }
        }

        if let Some(candidate) = candidate_from_fields(table, row_index, &fields) {
            candidates.push(candidate);
        }
        row_index += 1;
    }

    Ok(candidates)
}

fn quote_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn value_to_string(value: ValueRef<'_>) -> Option<String> {
    match value {
        ValueRef::Null => None,
        ValueRef::Integer(value) => Some(value.to_string()),
        ValueRef::Real(value) => Some(value.to_string()),
        ValueRef::Text(value) => Some(String::from_utf8_lossy(value).to_string()),
        ValueRef::Blob(_) => None,
    }
}

fn normalize_key(key: &str) -> String {
    key.to_ascii_lowercase().replace(['-', ' '], "_")
}

fn insert_field(fields: &mut HashMap<String, String>, key: &str, value: String) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }

    fields.entry(normalize_key(key)).or_insert_with(|| trimmed.to_string());
}

fn collect_json_fields(fields: &mut HashMap<String, String>, value: &str) {
    let Ok(json) = serde_json::from_str::<Value>(value) else {
        return;
    };

    collect_json_value(fields, &json);
}

fn collect_json_value(fields: &mut HashMap<String, String>, value: &Value) {
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                match value {
                    Value::String(text) => insert_field(fields, key, text.clone()),
                    Value::Number(number) => insert_field(fields, key, number.to_string()),
                    Value::Array(_) | Value::Object(_) => collect_json_value(fields, value),
                    _ => {}
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_json_value(fields, item);
            }
        }
        _ => {}
    }
}

fn candidate_from_fields(
    table: &str,
    row_index: usize,
    fields: &HashMap<String, String>,
) -> Option<CcSwitchImportCandidate> {
    let name = find_first(fields, NAME_KEYS)
        .or_else(|| infer_name_from_url(find_first(fields, BASE_URL_KEYS).as_deref()))
        .or_else(|| find_first(fields, TYPE_KEYS))?;
    let provider_name = name.clone();
    let base_url = find_first(fields, BASE_URL_KEYS);
    let api_key = find_first(fields, API_KEY_KEYS);
    let models = find_models(fields);
    let model = models.first().cloned();
    let provider_type = if base_url.is_some() || type_looks_openai(find_first(fields, TYPE_KEYS).as_deref()) {
        "openai-compatible"
    } else {
        "unknown"
    };
    let safe_provider = safe_name(&provider_name);
    let env_name = suggested_env_name(&safe_provider);
    let mut warnings = Vec::new();

    if base_url.is_none() {
        warnings.push("Missing base URL.".to_string());
    }
    if model.is_none() {
        warnings.push("Missing model.".to_string());
    }
    if provider_type == "unknown" {
        warnings.push("Provider type is unknown.".to_string());
    }
    if api_key.is_none() {
        warnings.push("No API key field detected.".to_string());
    }

    let complete = base_url.is_some() && model.is_some() && provider_type == "openai-compatible";

    Some(CcSwitchImportCandidate {
        id: format!("{table}:{row_index}:{safe_provider}"),
        source_table: Some(table.to_string()),
        source_id: find_source_id(fields),
        name,
        provider_name,
        provider_type: provider_type.to_string(),
        base_url,
        api_key_env: Some(env_name.clone()),
        api_key_detected: api_key.is_some(),
        api_key_preview: api_key.as_deref().map(mask_secret),
        model,
        models,
        suggested_modelgate_provider: safe_provider.clone(),
        suggested_modelgate_alias: format!("{safe_provider}-main"),
        suggested_env_name: env_name,
        complete,
        warnings,
    })
}

fn find_first(fields: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = fields.get(&normalize_key(key)) {
            if !value.trim().is_empty() {
                return Some(value.trim().to_string());
            }
        }
    }
    None
}

fn find_models(fields: &HashMap<String, String>) -> Vec<String> {
    let mut models = Vec::new();

    if let Some(value) = find_first(fields, MODEL_KEYS) {
        if let Ok(json) = serde_json::from_str::<Value>(&value) {
            collect_models_from_json(&json, &mut models);
        } else {
            models.extend(
                value
                    .split([',', '\n', ';'])
                    .map(str::trim)
                    .filter(|model| !model.is_empty())
                    .map(String::from),
            );
        }
    }

    let mut seen = HashSet::new();
    models.retain(|model| seen.insert(model.clone()));
    models
}

fn collect_models_from_json(value: &Value, models: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            if !text.trim().is_empty() {
                models.push(text.trim().to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_models_from_json(item, models);
            }
        }
        Value::Object(map) => {
            for key in MODEL_KEYS {
                if let Some(value) = map.get(*key) {
                    collect_models_from_json(value, models);
                }
            }
        }
        _ => {}
    }
}

fn find_source_id(fields: &HashMap<String, String>) -> Option<String> {
    find_first(fields, &["id", "uuid", "provider_id"])
}

fn type_looks_openai(value: Option<&str>) -> bool {
    value
        .map(|value| {
            let value = value.to_ascii_lowercase();
            value.contains("openai") || value.contains("compatible")
        })
        .unwrap_or(false)
}

fn infer_name_from_url(value: Option<&str>) -> Option<String> {
    let value = value?;
    let without_scheme = value
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let host = without_scheme.split('/').next().unwrap_or(without_scheme);
    let label = host
        .split('.')
        .find(|part| !matches!(*part, "api" | "www" | "compatible-mode"))?;

    Some(label.to_string())
}

fn safe_name(value: &str) -> String {
    let mut output = String::new();

    for character in value.to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
            output.push(character);
        } else if character.is_ascii_whitespace() || character == '.' || character == '/' {
            output.push('-');
        }
    }

    let output = output.trim_matches('-').to_string();
    if output.is_empty() {
        "ccswitch-provider".to_string()
    } else {
        output
    }
}

fn suggested_env_name(provider: &str) -> String {
    format!(
        "{}_API_KEY",
        provider
            .chars()
            .map(|character| if character.is_ascii_alphanumeric() { character.to_ascii_uppercase() } else { '_' })
            .collect::<String>()
            .trim_matches('_')
    )
}

fn mask_secret(value: &str) -> String {
    let trimmed = value.trim();

    if trimmed.len() <= 8 {
        return "****".to_string();
    }

    let prefix = trimmed.chars().take(3).collect::<String>();
    let suffix = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    format!("{prefix}-****{suffix}")
}

fn dedupe_candidates(candidates: &mut Vec<CcSwitchImportCandidate>) {
    let mut seen = HashSet::new();
    candidates.retain(|candidate| {
        let key = format!(
            "{}|{}|{}",
            candidate.suggested_modelgate_provider,
            candidate.base_url.clone().unwrap_or_default(),
            candidate.model.clone().unwrap_or_default()
        );
        seen.insert(key)
    });
}
