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
    app: String,
    name: String,
    provider_name: String,
    provider_type: String,
    base_url: Option<String>,
    description: Option<String>,
    api_key_env: Option<String>,
    api_key_detected: bool,
    api_key_preview: Option<String>,
    model: Option<String>,
    models: Vec<String>,
    suggested_modelgate_provider: String,
    suggested_modelgate_alias: String,
    suggested_env_name: String,
    complete: bool,
    modelgate_managed: bool,
    warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchTableInfo {
    name: String,
    row_count: Option<usize>,
    columns: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSwitchImportReport {
    db_path: String,
    tables: Vec<CcSwitchTableInfo>,
    candidates_found: usize,
    skipped_modelgate_managed: usize,
    warnings: Vec<String>,
    parser: String,
}

#[derive(Serialize)]
pub struct CcSwitchScanResult {
    path: String,
    candidates: Vec<CcSwitchImportCandidate>,
    skipped_modelgate_managed: usize,
    warnings: Vec<String>,
    report: CcSwitchImportReport,
}

struct SchemaCandidateRow {
    id: String,
    app_type: String,
    name: String,
    settings_config: Value,
    notes: Option<String>,
    category: Option<String>,
    meta: Value,
}

struct TableScanResult {
    candidates: Vec<CcSwitchImportCandidate>,
    skipped_modelgate_managed: usize,
}

const NAME_KEYS: &[&str] = &["name", "label", "display_name", "title", "provider_name"];
const APP_KEYS: &[&str] = &["app", "app_type", "source", "target_app", "application", "codex_session"];
const BASE_URL_KEYS: &[&str] = &["base_url", "baseurl", "api_base", "apibase", "endpoint", "url", "base"];
const API_KEY_KEYS: &[&str] = &[
    "api_key",
    "apikey",
    "apiKey",
    "key",
    "token",
    "auth_token",
    "authorization",
    "openai_api_key",
    "OPENAI_API_KEY",
];
const NOTES_KEYS: &[&str] = &[
    "description",
    "desc",
    "notes",
    "note",
    "remark",
    "remarks",
    "comment",
    "comments",
    "memo",
    "metadata",
];
const MODEL_KEYS: &[&str] = &[
    "model",
    "model_name",
    "modelname",
    "default_model",
    "defaultmodel",
    "codex_model",
    "models",
];
const TYPE_KEYS: &[&str] = &["type", "api_type", "protocol", "kind", "api_format"];
const OPENAI_OFFICIAL_BASE_URL: &str = "https://api.openai.com/v1";

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
pub fn scan_ccswitch_database(show_managed: Option<bool>) -> Result<CcSwitchScanResult, String> {
    scan_database(&default_database_path(), show_managed.unwrap_or(false))
}

#[tauri::command]
pub fn scan_selected_ccswitch_database(path: String, show_managed: Option<bool>) -> Result<CcSwitchScanResult, String> {
    scan_database(Path::new(&path), show_managed.unwrap_or(false))
}

fn default_database_path() -> PathBuf {
    let home = env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    home.join(".cc-switch").join("cc-switch.db")
}

fn scan_database(path: &Path, show_managed: bool) -> Result<CcSwitchScanResult, String> {
    if !path.is_file() {
        return Err(format!("CC Switch database not found: {}", path.display()));
    }

    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("Failed to open SQLite database read-only: {error}"))?;

    let db_path = path.to_string_lossy().to_string();
    let tables = describe_tables(&connection)?;
    let mut warnings = Vec::new();

    let (mut candidates, skipped_modelgate_managed, parser) = if has_current_ccswitch_schema(&tables) {
        match scan_current_schema(&connection, show_managed) {
            Ok(result) => (result.candidates, result.skipped_modelgate_managed, "ccswitch-current-schema".to_string()),
            Err(error) => {
                warnings.push(format!("Current schema parser failed: {error}. Falling back to heuristic scanner."));
                let result = scan_heuristic(&connection, &tables, show_managed, &mut warnings);
                (result.candidates, result.skipped_modelgate_managed, "heuristic".to_string())
            }
        }
    } else {
        warnings.push("Current CC Switch providers/provider_endpoints schema was not found; using heuristic scanner.".to_string());
        let result = scan_heuristic(&connection, &tables, show_managed, &mut warnings);
        (result.candidates, result.skipped_modelgate_managed, "heuristic".to_string())
    };

    dedupe_candidates(&mut candidates);

    if candidates.is_empty() {
        warnings.push("Scanned database, but no importable Codex model configs were recognized.".to_string());
        warnings.push("Possible causes: schema changed, app_type is not codex, or base URL/model fields are missing.".to_string());
    }

    let report = CcSwitchImportReport {
        db_path,
        tables,
        candidates_found: candidates.len(),
        skipped_modelgate_managed,
        warnings: warnings.clone(),
        parser,
    };

    Ok(CcSwitchScanResult {
        path: report.db_path.clone(),
        candidates,
        skipped_modelgate_managed,
        warnings,
        report,
    })
}

fn describe_tables(connection: &Connection) -> Result<Vec<CcSwitchTableInfo>, String> {
    let mut statement = connection
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    let mut tables = Vec::new();
    for row in rows {
        let name = row.map_err(|error| error.to_string())?;
        let columns = table_columns(connection, &name).unwrap_or_default();
        let row_count = table_row_count(connection, &name).ok();
        tables.push(CcSwitchTableInfo {
            name,
            row_count,
            columns,
        });
    }

    Ok(tables)
}

fn table_columns(connection: &Connection, table: &str) -> Result<Vec<String>, String> {
    let sql = format!("PRAGMA table_info({})", quote_identifier(table));
    let mut statement = connection.prepare(&sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| error.to_string())?;

    let mut columns = Vec::new();
    for row in rows {
        columns.push(row.map_err(|error| error.to_string())?);
    }
    Ok(columns)
}

fn table_row_count(connection: &Connection, table: &str) -> Result<usize, String> {
    let sql = format!("SELECT COUNT(*) FROM {}", quote_identifier(table));
    let count = connection
        .query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map_err(|error| error.to_string())?;
    Ok(count.max(0) as usize)
}

fn has_current_ccswitch_schema(tables: &[CcSwitchTableInfo]) -> bool {
    let Some(providers) = tables.iter().find(|table| table.name == "providers") else {
        return false;
    };
    let required = ["id", "app_type", "name", "settings_config"];
    required.iter().all(|column| providers.columns.iter().any(|item| item == column))
}

fn scan_current_schema(connection: &Connection, show_managed: bool) -> Result<TableScanResult, String> {
    let endpoints = load_provider_endpoints(connection).unwrap_or_default();
    let order_clause = provider_order_clause(connection);
    let mut statement = connection
        .prepare(&format!(
            "SELECT id, app_type, name, settings_config, notes, category, meta
             FROM providers
             WHERE lower(app_type) LIKE '%codex%'
             ORDER BY {order_clause}",
        ))
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            let settings_text: String = row.get(3)?;
            let meta_text: String = row.get(6).unwrap_or_else(|_| "{}".to_string());
            Ok(SchemaCandidateRow {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                settings_config: serde_json::from_str(&settings_text).unwrap_or(Value::Null),
                notes: row.get(4).ok(),
                category: row.get(5).ok(),
                meta: serde_json::from_str(&meta_text).unwrap_or(Value::Null),
            })
        })
        .map_err(|error| error.to_string())?;

    let mut candidates = Vec::new();
    let mut skipped_modelgate_managed = 0usize;

    for row in rows {
        let row = row.map_err(|error| error.to_string())?;
        if !looks_like_codex_app(&row.app_type) {
            continue;
        }

        let urls = endpoints
            .get(&(row.id.clone(), row.app_type.clone()))
            .cloned()
            .unwrap_or_default();
        let candidate = candidate_from_current_schema(&row, urls);

        if candidate.model.is_none() {
            continue;
        }

        if !show_managed && candidate.modelgate_managed {
            skipped_modelgate_managed += 1;
            continue;
        }

        candidates.push(candidate);
    }

    Ok(TableScanResult {
        candidates,
        skipped_modelgate_managed,
    })
}

fn provider_order_clause(connection: &Connection) -> String {
    let columns = table_columns(connection, "providers").unwrap_or_default();
    let has_column = |name: &str| columns.iter().any(|column| column == name);
    let mut parts = Vec::new();

    for column in ["sort_index", "sort_order", "position", "order"] {
        if has_column(column) {
            parts.push(format!("COALESCE({}, 999999)", quote_identifier(column)));
        }
    }

    if has_column("created_at") {
        parts.push("created_at ASC".to_string());
    }

    parts.push("id ASC".to_string());
    parts.join(", ")
}

fn load_provider_endpoints(connection: &Connection) -> Result<HashMap<(String, String), Vec<String>>, String> {
    let mut statement = connection
        .prepare(
            "SELECT provider_id, app_type, url
             FROM provider_endpoints
             ORDER BY added_at ASC, url ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    let mut endpoints: HashMap<(String, String), Vec<String>> = HashMap::new();
    for row in rows {
        let (provider_id, app_type, url) = row.map_err(|error| error.to_string())?;
        endpoints.entry((provider_id, app_type)).or_default().push(url);
    }
    Ok(endpoints)
}

fn candidate_from_current_schema(row: &SchemaCandidateRow, endpoints: Vec<String>) -> CcSwitchImportCandidate {
    let (base_url, api_key, models, provider_type_hint) = extract_current_provider_fields(row);
    let model = models.first().cloned();
    let openai_official = is_openai_official_row(row, model.as_deref());
    let base_url = base_url
        .or_else(|| endpoints.first().cloned())
        .or_else(|| openai_official.then(|| OPENAI_OFFICIAL_BASE_URL.to_string()));
    let provider_name = row.name.clone();
    let safe_provider = safe_name(&provider_name);
    let alias_name = safe_name(&row.name);
    let env_name = api_key
        .as_deref()
        .and_then(extract_env_name)
        .unwrap_or_else(|| {
            if openai_official {
                "OPENAI_API_KEY".to_string()
            } else {
                suggested_env_name(&safe_provider)
            }
        });
    let description = extract_current_description(row);
    let modelgate_managed = is_current_schema_modelgate_managed(row, base_url.as_deref(), model.as_deref(), api_key.as_deref());
    let provider_type = if current_provider_looks_openai_compatible(row, base_url.as_deref(), provider_type_hint.as_deref()) {
        "openai-compatible"
    } else {
        "unknown"
    };
    let mut warnings = Vec::new();

    if base_url.is_none() {
        warnings.push("Missing base URL.".to_string());
    }
    if model.is_none() {
        warnings.push("Missing model.".to_string());
    }
    if api_key.is_none() {
        warnings.push("No API key field detected.".to_string());
    }
    if provider_type == "unknown" {
        warnings.push(format!("Provider app '{}' is not clearly OpenAI-compatible.", row.app_type));
    }
    if modelgate_managed {
        warnings.push("ModelGate-managed CC Switch provider.".to_string());
    }
    if row.category.as_deref() == Some("official") && !openai_official {
        warnings.push("Official/default provider; review before importing.".to_string());
    }

    let complete = base_url.is_some() && model.is_some() && provider_type == "openai-compatible";

    CcSwitchImportCandidate {
        id: format!("providers:{}:{}", row.app_type, row.id),
        source_table: Some("providers".to_string()),
        source_id: Some(row.id.clone()),
        app: row.app_type.clone(),
        name: row.name.clone(),
        provider_name,
        provider_type: provider_type.to_string(),
        base_url,
        description,
        api_key_env: Some(env_name.clone()),
        api_key_detected: api_key.is_some(),
        api_key_preview: api_key.as_deref().map(mask_secret),
        model,
        models,
        suggested_modelgate_provider: safe_provider.clone(),
        suggested_modelgate_alias: alias_name,
        suggested_env_name: env_name,
        complete,
        modelgate_managed,
        warnings,
    }
}

fn extract_current_provider_fields(row: &SchemaCandidateRow) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    match row.app_type.to_ascii_lowercase().as_str() {
        "codex" => extract_codex_fields(&row.settings_config),
        "claude" | "claude-desktop" => extract_claude_fields(&row.settings_config, &row.meta),
        "gemini" => extract_gemini_fields(&row.settings_config),
        "opencode" => extract_opencode_fields(&row.settings_config),
        "openclaw" => extract_openclaw_fields(&row.settings_config),
        "hermes" => extract_hermes_fields(&row.settings_config),
        _ => extract_generic_json_fields(&row.settings_config),
    }
}

fn extract_codex_fields(settings: &Value) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    let config_text = settings.get("config").and_then(Value::as_str).unwrap_or_default();
    let base_url = extract_toml_string(config_text, "base_url");
    let api_key = settings
        .pointer("/auth/OPENAI_API_KEY")
        .and_then(Value::as_str)
        .map(String::from)
        .or_else(|| extract_toml_string(config_text, "api_key"));
    let mut models = Vec::new();
    if let Some(model) = extract_toml_string(config_text, "model") {
        models.push(model);
    }
    (base_url, api_key, models, Some("openai-compatible".to_string()))
}

fn extract_claude_fields(settings: &Value, meta: &Value) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    let env = settings.get("env");
    let base_url = json_string_at(env, "ANTHROPIC_BASE_URL");
    let api_key = first_json_string(env, &[
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_API_KEY",
        "OPENROUTER_API_KEY",
        "GOOGLE_API_KEY",
    ]);
    let models = json_strings(env, &[
        "ANTHROPIC_MODEL",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
    ]);
    let hint = meta
        .get("apiFormat")
        .and_then(Value::as_str)
        .map(String::from);
    (base_url, api_key, models, hint)
}

fn extract_gemini_fields(settings: &Value) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    let env = settings.get("env");
    (
        json_string_at(env, "GOOGLE_GEMINI_BASE_URL"),
        first_json_string(env, &["GEMINI_API_KEY", "GOOGLE_API_KEY"]),
        json_strings(env, &["GEMINI_MODEL"]),
        Some("gemini".to_string()),
    )
}

fn extract_opencode_fields(settings: &Value) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    let options = settings.get("options");
    let mut models = Vec::new();
    collect_models_from_json(settings.get("models").unwrap_or(&Value::Null), &mut models);
    (
        json_string_at(options, "baseURL"),
        json_string_at(options, "apiKey"),
        models,
        settings.get("npm").and_then(Value::as_str).map(String::from),
    )
}

fn extract_openclaw_fields(settings: &Value) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    let mut models = Vec::new();
    collect_models_from_json(settings.get("models").unwrap_or(&Value::Null), &mut models);
    (
        json_string_at(Some(settings), "baseUrl"),
        json_string_at(Some(settings), "apiKey"),
        models,
        json_string_at(Some(settings), "api"),
    )
}

fn extract_hermes_fields(settings: &Value) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    let mut models = Vec::new();
    collect_models_from_json(settings.get("models").unwrap_or(&Value::Null), &mut models);
    (
        json_string_at(Some(settings), "base_url"),
        json_string_at(Some(settings), "api_key"),
        models,
        json_string_at(Some(settings), "api_mode"),
    )
}

fn extract_generic_json_fields(settings: &Value) -> (Option<String>, Option<String>, Vec<String>, Option<String>) {
    let mut fields = HashMap::new();
    collect_json_value(&mut fields, settings);
    (
        find_first(&fields, BASE_URL_KEYS),
        find_first(&fields, API_KEY_KEYS),
        find_models(&fields),
        find_first(&fields, TYPE_KEYS),
    )
}

fn extract_toml_string(config: &str, key: &str) -> Option<String> {
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || !trimmed.starts_with(key) {
            continue;
        }
        let Some((left, right)) = trimmed.split_once('=') else {
            continue;
        };
        if left.trim() != key {
            continue;
        }
        return Some(
            right
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string(),
        )
        .filter(|value| !value.is_empty());
    }
    None
}

fn json_string_at(value: Option<&Value>, key: &str) -> Option<String> {
    value?
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
}

fn first_json_string(value: Option<&Value>, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = json_string_at(value, key) {
            return Some(value);
        }
    }
    None
}

fn json_strings(value: Option<&Value>, keys: &[&str]) -> Vec<String> {
    let mut output = Vec::new();
    for key in keys {
        if let Some(value) = json_string_at(value, key) {
            output.push(value);
        }
    }
    dedupe_strings(&mut output);
    output
}

fn current_provider_looks_openai_compatible(row: &SchemaCandidateRow, base_url: Option<&str>, hint: Option<&str>) -> bool {
    if looks_like_codex_app(&row.app_type) {
        return true;
    }

    if hint
        .map(|value| {
            let value = value.to_ascii_lowercase();
            value.contains("openai") || value.contains("compatible") || value.contains("chat_completions")
        })
        .unwrap_or(false)
    {
        return true;
    }

    base_url
        .map(|url| {
            let url = url.to_ascii_lowercase();
            url.contains("/v1") || url.contains("openrouter") || url.contains("compatible")
        })
        .unwrap_or(false)
}

fn is_current_schema_modelgate_managed(
    row: &SchemaCandidateRow,
    base_url: Option<&str>,
    model: Option<&str>,
    api_key: Option<&str>,
) -> bool {
    let notes = row.notes.as_deref().unwrap_or_default().to_ascii_lowercase();
    if notes.contains("modelgate-managed=true") {
        return true;
    }

    if row.name.to_ascii_lowercase().contains("modelgate local") {
        return true;
    }

    if base_url
        .unwrap_or_default()
        .trim_end_matches('/')
        .eq_ignore_ascii_case("http://127.0.0.1:11435/v1")
        || base_url
            .unwrap_or_default()
            .trim_end_matches('/')
            .eq_ignore_ascii_case("http://localhost:11435/v1")
    {
        return true;
    }

    model == Some("codex-main") && api_key == Some("modelgate-local")
}

fn scan_heuristic(
    connection: &Connection,
    tables: &[CcSwitchTableInfo],
    show_managed: bool,
    warnings: &mut Vec<String>,
) -> TableScanResult {
    let mut candidates = Vec::new();
    let mut skipped_modelgate_managed = 0usize;

    for table in tables {
        if !is_candidate_table(&table.name) {
            continue;
        }

        match scan_table(connection, &table.name, show_managed) {
            Ok(mut table_result) => {
                skipped_modelgate_managed += table_result.skipped_modelgate_managed;
                candidates.append(&mut table_result.candidates);
            }
            Err(error) => warnings.push(format!("Failed to scan table {}: {error}", table.name)),
        }
    }

    TableScanResult {
        candidates,
        skipped_modelgate_managed,
    }
}

fn is_candidate_table(table: &str) -> bool {
    let name = table.to_lowercase();
    name == "providers"
        || name == "provider_endpoints"
        || name.contains("provider")
        || name.contains("endpoint")
        || name.contains("model")
}

fn scan_table(connection: &Connection, table: &str, show_managed: bool) -> Result<TableScanResult, String> {
    let sql = format!("SELECT * FROM {} LIMIT 100", quote_identifier(table));
    let mut statement = connection.prepare(&sql).map_err(|error| error.to_string())?;
    let column_names = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    let mut candidates = Vec::new();
    let mut skipped_modelgate_managed = 0usize;
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

        if !show_managed && is_modelgate_managed_provider(&fields) {
            skipped_modelgate_managed += 1;
            row_index += 1;
            continue;
        }

        if !fields_look_codex(&fields) {
            row_index += 1;
            continue;
        }

        if let Some(candidate) = candidate_from_fields(table, row_index, &fields) {
            candidates.push(candidate);
        }
        row_index += 1;
    }

    Ok(TableScanResult {
        candidates,
        skipped_modelgate_managed,
    })
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
    let description = find_first(fields, NOTES_KEYS);
    let provider_type = if base_url.is_some() || type_looks_openai(find_first(fields, TYPE_KEYS).as_deref()) {
        "openai-compatible"
    } else {
        "unknown"
    };
    let safe_provider = safe_name(&provider_name);
    let alias_name = safe_name(&name);
    let env_name = api_key
        .as_deref()
        .and_then(extract_env_name)
        .unwrap_or_else(|| suggested_env_name(&safe_provider));
    let modelgate_managed = is_modelgate_managed_provider(fields);
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
    if modelgate_managed {
        warnings.push("ModelGate-managed CC Switch provider.".to_string());
    }

    let complete = base_url.is_some() && model.is_some() && provider_type == "openai-compatible";

    Some(CcSwitchImportCandidate {
        id: format!("{table}:{row_index}:{safe_provider}"),
        source_table: Some(table.to_string()),
        source_id: find_source_id(fields),
        app: find_first(fields, &["app_type", "app"]).unwrap_or_else(|| "unknown".to_string()),
        name,
        provider_name,
        provider_type: provider_type.to_string(),
        base_url,
        description,
        api_key_env: Some(env_name.clone()),
        api_key_detected: api_key.is_some(),
        api_key_preview: api_key.as_deref().map(mask_secret),
        model,
        models,
        suggested_modelgate_provider: safe_provider.clone(),
        suggested_modelgate_alias: alias_name,
        suggested_env_name: env_name,
        complete,
        modelgate_managed,
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

fn looks_like_codex_app(value: &str) -> bool {
    value.to_ascii_lowercase().contains("codex")
}

fn fields_look_codex(fields: &HashMap<String, String>) -> bool {
    find_first(fields, APP_KEYS)
        .map(|value| looks_like_codex_app(&value))
        .unwrap_or(false)
}

fn extract_current_description(row: &SchemaCandidateRow) -> Option<String> {
    row.notes
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
        .or_else(|| find_description_in_json(&row.settings_config))
        .or_else(|| find_description_in_json(&row.meta))
}

fn find_description_in_json(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in NOTES_KEYS {
                let direct = map.get(*key);
                let normalized = direct.or_else(|| {
                    map.iter()
                        .find(|(candidate, _)| normalize_key(candidate) == normalize_key(key))
                        .map(|(_, value)| value)
                });

                if let Some(value) = normalized.and_then(value_to_description) {
                    return Some(value);
                }
            }

            for value in map.values() {
                if let Some(description) = find_description_in_json(value) {
                    return Some(description);
                }
            }

            None
        }
        Value::Array(items) => {
            for item in items {
                if let Some(description) = find_description_in_json(item) {
                    return Some(description);
                }
            }
            None
        }
        _ => None,
    }
}

fn value_to_description(value: &Value) -> Option<String> {
    let text = match value {
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        Value::Bool(value) => value.to_string(),
        Value::Array(_) | Value::Object(_) => serde_json::to_string(value).ok()?,
        Value::Null => return None,
    };

    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

fn is_modelgate_managed_provider(fields: &HashMap<String, String>) -> bool {
    let notes = find_first(fields, NOTES_KEYS).unwrap_or_default().to_ascii_lowercase();
    if notes.contains("modelgate-managed=true") {
        return true;
    }

    let name = find_first(fields, NAME_KEYS).unwrap_or_default().to_ascii_lowercase();
    if name.contains("modelgate local") {
        return true;
    }

    let endpoint = find_first(fields, BASE_URL_KEYS)
        .unwrap_or_default()
        .trim_end_matches('/')
        .to_ascii_lowercase();
    if matches!(
        endpoint.as_str(),
        "http://127.0.0.1:11435/v1" | "http://localhost:11435/v1"
    ) {
        return true;
    }

    let model = find_first(fields, MODEL_KEYS).unwrap_or_default();
    let api_key = find_first(fields, API_KEY_KEYS).unwrap_or_default();
    model == "codex-main" && api_key == "modelgate-local"
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

    dedupe_strings(&mut models);
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
                if let Some(id) = item.get("id").and_then(Value::as_str) {
                    models.push(id.to_string());
                } else if let Some(name) = item.get("name").and_then(Value::as_str) {
                    models.push(name.to_string());
                } else {
                    collect_models_from_json(item, models);
                }
            }
        }
        Value::Object(map) => {
            for key in MODEL_KEYS {
                if let Some(value) = map.get(*key) {
                    collect_models_from_json(value, models);
                }
            }
            for (key, value) in map {
                if value.is_object() {
                    models.push(key.clone());
                }
            }
        }
        _ => {}
    }
    dedupe_strings(models);
}

fn dedupe_strings(values: &mut Vec<String>) {
    let mut seen = HashSet::new();
    values.retain(|value| seen.insert(value.clone()));
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

fn is_openai_official_row(row: &SchemaCandidateRow, model: Option<&str>) -> bool {
    if !model.map(model_looks_openai_official).unwrap_or(false) {
        return false;
    }

    [row.name.as_str(), row.id.as_str(), row.category.as_deref().unwrap_or_default()]
        .iter()
        .any(|value| provider_looks_openai_official(value))
}

fn model_looks_openai_official(model: &str) -> bool {
    let model = model.trim().to_ascii_lowercase();
    model.starts_with("gpt-")
        || model.starts_with("o1")
        || model.starts_with("o3")
        || model.starts_with("o4")
}

fn provider_looks_openai_official(value: &str) -> bool {
    let normalized = value
        .trim()
        .to_ascii_lowercase()
        .replace(['-', ' ', '.'], "_");
    matches!(
        normalized.as_str(),
        "openai"
            | "openai_official"
            | "official_openai"
            | "codex_official"
            | "official"
    )
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

fn extract_env_name(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let normalized = trimmed
        .strip_prefix("env:")
        .or_else(|| trimmed.strip_prefix("ENV:"))
        .unwrap_or(trimmed)
        .trim();

    if let Some(name) = normalized
        .strip_prefix("${")
        .and_then(|value| value.strip_suffix('}'))
        .filter(|name| is_env_name(name))
    {
        return Some(name.to_string());
    }

    if let Some(name) = normalized
        .strip_prefix('$')
        .filter(|name| is_env_name(name))
    {
        return Some(name.to_string());
    }

    if is_env_name(normalized) && normalized.ends_with("_API_KEY") {
        return Some(normalized.to_string());
    }

    None
}

fn is_env_name(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    (first == '_' || first.is_ascii_alphabetic())
        && chars.all(|character| character == '_' || character.is_ascii_alphanumeric())
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
            "{}|{}|{}|{}|{}",
            candidate.app,
            candidate.name,
            candidate.suggested_modelgate_provider,
            candidate.base_url.clone().unwrap_or_default(),
            candidate.model.clone().unwrap_or_default()
        );
        seen.insert(key)
    });
}
