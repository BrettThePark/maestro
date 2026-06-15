//! Writes Claude Code hooks configuration into `.claude/settings.local.json`.
//!
//! This module handles generating and writing hook configuration that tells
//! Claude Code to POST hook events (SessionStart, SessionEnd, PreToolUse, Stop)
//! back to Maestro's HTTP status server via curl commands.

use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

use dashmap::DashMap;
use serde_json::{json, Value};
use tokio::sync::Mutex;

/// Per-directory lock serializing concurrent settings.local.json read-modify-write ops.
static DIR_LOCKS: LazyLock<DashMap<PathBuf, Arc<Mutex<()>>>> = LazyLock::new(DashMap::new);

/// Acquire a per-directory lock for atomic settings.local.json operations.
fn dir_lock(dir: &Path) -> Arc<Mutex<()>> {
    DIR_LOCKS
        .entry(dir.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .value()
        .clone()
}

/// Write content to a file atomically: write a temp file in the same directory, then rename.
///
/// Claude Code also writes `.claude/settings.local.json` (enabledPlugins,
/// enabledMcpjsonServers). A plain in-place write can interleave with that and
/// leave torn/invalid JSON; an atomic rename guarantees a reader always sees a
/// complete file — never a partial mix.
async fn atomic_write(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("No parent directory")?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("settings.local.json");
    let temp_path = parent.join(format!(".{}.tmp.{}", file_name, std::process::id()));

    tokio::fs::write(&temp_path, content)
        .await
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    tokio::fs::rename(&temp_path, path).await.map_err(|e| {
        // Clean up temp file on rename failure
        let _ = std::fs::remove_file(&temp_path);
        format!("Failed to rename temp file: {}", e)
    })?;

    Ok(())
}

/// Builds the hooks configuration JSON for a session.
///
/// Generates hook entries for SessionStart, SessionEnd, PreToolUse, and Stop.
/// Each hook uses curl to POST event data back to Maestro's HTTP server.
///
/// Note: PreToolUse is marked `"async": true` (fire-and-forget) so it doesn't
/// block Claude Code. The other hooks do NOT have the async flag.
fn build_hooks_config(session_id: u32, status_port: u16, instance_id: &str) -> Value {
    let base_url = format!("http://127.0.0.1:{}", status_port);
    let common_headers = format!(
        "-H 'Content-Type: application/json' -H 'X-Maestro-Session: {}' -H 'X-Maestro-Instance: {}'",
        session_id, instance_id
    );

    let make_hook = |endpoint: &str, is_async: bool| -> Value {
        let command = format!(
            "curl -s -X POST {}/{} {} -d @/dev/stdin",
            base_url, endpoint, common_headers
        );

        let mut hook = json!({
            "type": "command",
            "command": command,
        });

        if is_async {
            hook["async"] = json!(true);
        }

        json!([{ "hooks": [hook] }])
    };

    json!({
        "SessionStart": make_hook("hook/session-start", false),
        "SessionEnd": make_hook("hook/session-end", false),
        "PreToolUse": make_hook("hook/pre-tool", true),
        "Stop": make_hook("hook/stop", false),
    })
}

/// Writes session hooks configuration to `.claude/settings.local.json`.
///
/// This function:
/// 1. Creates the `.claude/` directory if it doesn't exist
/// 2. Reads existing `.claude/settings.local.json` or starts with `{}`
/// 3. Builds hooks config with `build_hooks_config()`
/// 4. Sets `config["hooks"]` to the generated hooks
/// 5. Writes back with `serde_json::to_string_pretty`
///
/// Other keys in settings.local.json (e.g. `enabledPlugins`) are preserved.
///
/// # Arguments
///
/// * `working_dir` - Directory where `.claude/settings.local.json` will be written
/// * `session_id` - Session identifier for the hook curl headers
/// * `status_port` - Port of the Maestro HTTP status server
/// * `instance_id` - UUID for this Maestro instance
pub async fn write_session_hooks_config(
    working_dir: &Path,
    session_id: u32,
    status_port: u16,
    instance_id: &str,
) -> Result<(), String> {
    // Create .claude directory if needed
    let claude_dir = working_dir.join(".claude");
    if !claude_dir.exists() {
        tokio::fs::create_dir_all(&claude_dir)
            .await
            .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
    }

    // Serialize concurrent writes to this directory's settings file and write
    // atomically (temp + rename), so a racing writer (e.g. Claude Code rewriting
    // enabledPlugins) can never leave torn/invalid JSON.
    let lock = dir_lock(&claude_dir);
    let _guard = lock.lock().await;

    // Read existing settings or start fresh
    let settings_path = claude_dir.join("settings.local.json");
    let mut config: Value = if settings_path.exists() {
        let content = tokio::fs::read_to_string(&settings_path)
            .await
            .map_err(|e| format!("Failed to read settings.local.json: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings.local.json: {}", e))?
    } else {
        json!({})
    };

    // Build and set hooks config
    let hooks = build_hooks_config(session_id, status_port, instance_id);
    config["hooks"] = hooks;

    // Write back
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize hooks config: {}", e))?;

    atomic_write(&settings_path, &content).await?;

    log::debug!(
        "Wrote session {} hooks config to {:?} (port={}, instance={})",
        session_id,
        settings_path,
        status_port,
        instance_id,
    );

    Ok(())
}

/// Removes session hooks configuration from `.claude/settings.local.json`.
///
/// Removes the `"hooks"` key while preserving other settings in the file.
/// No-op if the file doesn't exist.
///
/// # Arguments
///
/// * `working_dir` - Directory containing the `.claude/settings.local.json` file
pub async fn remove_session_hooks_config(working_dir: &Path) -> Result<(), String> {
    let settings_path = working_dir.join(".claude/settings.local.json");
    if !settings_path.exists() {
        return Ok(());
    }

    // Same per-directory lock + atomic write as the writer, so removal can't
    // race a concurrent write into a torn file.
    let lock = dir_lock(&working_dir.join(".claude"));
    let _guard = lock.lock().await;

    let content = tokio::fs::read_to_string(&settings_path)
        .await
        .map_err(|e| format!("Failed to read settings.local.json: {}", e))?;

    let mut config: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings.local.json: {}", e))?;

    // Remove the hooks key
    if let Some(obj) = config.as_object_mut() {
        if obj.remove("hooks").is_some() {
            log::debug!("Removed hooks config from {:?}", settings_path);
        }
    }

    // Write back the updated config
    let output = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    atomic_write(&settings_path, &output).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_write_hooks_config_fresh() {
        let dir = tempdir().unwrap();

        let result =
            write_session_hooks_config(dir.path(), 3, 9900, "test-instance-abc").await;
        assert!(result.is_ok(), "write_session_hooks_config failed: {:?}", result.err());

        // Verify the file exists
        let settings_path = dir.path().join(".claude/settings.local.json");
        assert!(settings_path.exists(), "settings.local.json should exist");

        // Parse and verify hooks content
        let content = std::fs::read_to_string(&settings_path).unwrap();
        let config: Value = serde_json::from_str(&content).unwrap();

        assert!(config.get("hooks").is_some(), "hooks key should exist");

        // Verify SessionStart curl has correct port and session_id
        let session_start = &config["hooks"]["SessionStart"];
        let command = session_start[0]["hooks"][0]["command"].as_str().unwrap();
        assert!(
            command.contains("127.0.0.1:9900"),
            "SessionStart command should contain port 9900, got: {}",
            command
        );
        assert!(
            command.contains("X-Maestro-Session: 3"),
            "SessionStart command should contain session_id 3, got: {}",
            command
        );
        assert!(
            command.contains("X-Maestro-Instance: test-instance-abc"),
            "SessionStart command should contain instance_id, got: {}",
            command
        );
        assert!(
            command.contains("hook/session-start"),
            "SessionStart command should target /hook/session-start, got: {}",
            command
        );
    }

    #[tokio::test]
    async fn test_write_hooks_preserves_existing() {
        let dir = tempdir().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();

        // Write pre-existing config with enabledPlugins
        let existing = json!({
            "enabledPlugins": {
                "some-plugin@official": true
            }
        });
        std::fs::write(
            claude_dir.join("settings.local.json"),
            serde_json::to_string_pretty(&existing).unwrap(),
        )
        .unwrap();

        // Write hooks config
        write_session_hooks_config(dir.path(), 1, 8080, "inst-xyz")
            .await
            .unwrap();

        // Read back and verify both keys exist
        let content =
            std::fs::read_to_string(claude_dir.join("settings.local.json")).unwrap();
        let config: Value = serde_json::from_str(&content).unwrap();

        // enabledPlugins should be preserved
        assert!(
            config.get("enabledPlugins").is_some(),
            "enabledPlugins should be preserved"
        );
        let plugins = config["enabledPlugins"].as_object().unwrap();
        assert_eq!(plugins["some-plugin@official"], true);

        // hooks should also be present
        assert!(config.get("hooks").is_some(), "hooks key should exist");
        assert!(
            config["hooks"].get("SessionStart").is_some(),
            "SessionStart hook should exist"
        );
    }

    #[tokio::test]
    async fn test_remove_hooks_config() {
        let dir = tempdir().unwrap();
        let claude_dir = dir.path().join(".claude");
        std::fs::create_dir_all(&claude_dir).unwrap();

        // Write a config with hooks + other keys
        let existing = json!({
            "someOtherSetting": "keep-me",
            "hooks": {
                "SessionStart": [{"hooks": [{"type": "command", "command": "curl ..."}]}]
            }
        });
        std::fs::write(
            claude_dir.join("settings.local.json"),
            serde_json::to_string_pretty(&existing).unwrap(),
        )
        .unwrap();

        // Remove hooks
        remove_session_hooks_config(dir.path()).await.unwrap();

        // Read back and verify
        let content =
            std::fs::read_to_string(claude_dir.join("settings.local.json")).unwrap();
        let config: Value = serde_json::from_str(&content).unwrap();

        // hooks should be gone
        assert!(config.get("hooks").is_none(), "hooks key should be removed");

        // other settings should be preserved
        assert_eq!(
            config["someOtherSetting"], "keep-me",
            "other settings should be preserved"
        );
    }

    #[tokio::test]
    async fn test_async_flag_on_pre_tool_use() {
        let hooks = build_hooks_config(5, 7777, "instance-123");

        // PreToolUse should have "async": true
        let pre_tool_hook = &hooks["PreToolUse"][0]["hooks"][0];
        assert_eq!(
            pre_tool_hook["async"],
            json!(true),
            "PreToolUse should have async: true"
        );

        // SessionStart should NOT have "async"
        let session_start_hook = &hooks["SessionStart"][0]["hooks"][0];
        assert!(
            session_start_hook.get("async").is_none()
                || session_start_hook["async"].is_null(),
            "SessionStart should NOT have async flag, got: {:?}",
            session_start_hook.get("async")
        );

        // SessionEnd should NOT have "async"
        let session_end_hook = &hooks["SessionEnd"][0]["hooks"][0];
        assert!(
            session_end_hook.get("async").is_none()
                || session_end_hook["async"].is_null(),
            "SessionEnd should NOT have async flag"
        );

        // Stop should NOT have "async"
        let stop_hook = &hooks["Stop"][0]["hooks"][0];
        assert!(
            stop_hook.get("async").is_none() || stop_hook["async"].is_null(),
            "Stop should NOT have async flag"
        );
    }

    #[tokio::test]
    async fn test_remove_handles_missing_file() {
        let dir = tempdir().unwrap();
        // No .claude directory or settings file exists
        let result = remove_session_hooks_config(dir.path()).await;
        assert!(result.is_ok(), "remove should be a no-op for missing file");
    }

    #[tokio::test]
    async fn test_atomic_write_produces_valid_json_and_no_temp_left() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.local.json");

        let content = serde_json::to_string_pretty(&json!({
            "enabledPlugins": { "x": true },
            "hooks": { "Stop": [] }
        }))
        .unwrap();

        atomic_write(&path, &content).await.unwrap();

        // File is complete + valid
        let read_back = std::fs::read_to_string(&path).unwrap();
        let parsed: Value = serde_json::from_str(&read_back).unwrap();
        assert_eq!(parsed["enabledPlugins"]["x"], json!(true));

        // No temp artifact should remain in the directory
        let temp_left = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().contains(".tmp."));
        assert!(!temp_left, "atomic_write must not leave a temp file behind");
    }

    #[tokio::test]
    async fn test_concurrent_hook_writes_produce_valid_json() {
        // Regression: a shorter concurrent writer (e.g. Claude Code rewriting
        // enabledPlugins) racing Maestro's longer hook write must never leave
        // settings.local.json as invalid JSON (the reported corruption).
        let dir = tempdir().unwrap();
        let claude = dir.path().join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        let path = claude.join("settings.local.json");

        for round in 0..60u32 {
            std::fs::write(&path, br#"{"enabledPlugins":{"a":true}}"#).unwrap();

            let d = dir.path().to_path_buf();
            let maestro = tokio::spawn(async move {
                // Maestro's (longer) hook write
                let _ = write_session_hooks_config(&d, round, 9900, "instance-xyz-abc-1234").await;
            });
            let p = path.clone();
            let claude_code = tokio::spawn(async move {
                // Claude Code's (shorter) rewrite of the same file
                let _ = tokio::fs::write(
                    &p,
                    br#"{"enabledPlugins":{"a":true},"enabledMcpjsonServers":["x"]}"#,
                )
                .await;
            });
            let _ = maestro.await;
            let _ = claude_code.await;

            let content = std::fs::read_to_string(&path).unwrap();
            assert!(
                serde_json::from_str::<Value>(&content).is_ok(),
                "round {}: settings.local.json must remain valid JSON, got:\n{}",
                round,
                content
            );
        }
    }
}
