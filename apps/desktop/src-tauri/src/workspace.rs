use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use uuid::Uuid;

/// Workspace status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceStatus {
    Running,
    Stopped,
    Starting,
    Error,
}

/// Workspace configuration persisted to disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub id: String,
    pub name: String,
    pub path: String,
    pub port: u16,
    pub auto_start: bool,
    pub password: Option<String>,
}

/// Runtime workspace info returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub id: String,
    pub name: String,
    pub path: String,
    pub port: u16,
    pub status: WorkspaceStatus,
    pub pid: Option<u32>,
    pub started_at: Option<String>,
    pub auto_start: bool,
    pub password: Option<String>,
}

/// Input for creating a workspace.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub path: String,
    pub port: Option<u16>,
    pub auto_start: Option<bool>,
    pub password: Option<String>,
}

/// Manages OpenCode server processes and workspace configs.
pub struct WorkspaceManager {
    config_dir: PathBuf,
    /// Map of workspace ID -> child process handle
    processes: Mutex<HashMap<String, Child>>,
}

impl WorkspaceManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        let config_dir = home.join(".opencode-hub").join("workspaces");
        fs::create_dir_all(&config_dir)?;

        Ok(Self {
            config_dir,
            processes: Mutex::new(HashMap::new()),
        })
    }

    /// Load all workspace configs from disk.
    fn load_configs(&self) -> Vec<WorkspaceConfig> {
        let mut configs = Vec::new();
        if let Ok(entries) = fs::read_dir(&self.config_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().map_or(false, |ext| ext == "json") {
                    if let Ok(content) = fs::read_to_string(entry.path()) {
                        if let Ok(config) = serde_json::from_str::<WorkspaceConfig>(&content) {
                            configs.push(config);
                        }
                    }
                }
            }
        }
        configs
    }

    /// Save a workspace config to disk.
    fn save_config(&self, config: &WorkspaceConfig) -> Result<(), String> {
        let path = self.config_dir.join(format!("{}.json", config.id));
        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    /// Delete a workspace config from disk.
    fn delete_config(&self, id: &str) -> Result<(), String> {
        let path = self.config_dir.join(format!("{}.json", id));
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Build WorkspaceInfo from config + runtime state.
    fn config_to_info(&self, config: &WorkspaceConfig) -> WorkspaceInfo {
        let processes = self.processes.lock().unwrap();
        let is_running = processes.contains_key(&config.id);

        WorkspaceInfo {
            id: config.id.clone(),
            name: config.name.clone(),
            path: config.path.clone(),
            port: config.port,
            status: if is_running {
                WorkspaceStatus::Running
            } else {
                WorkspaceStatus::Stopped
            },
            pid: if is_running {
                processes.get(&config.id).map(|c| c.id())
            } else {
                None
            },
            started_at: None, // TODO: track start time
            auto_start: config.auto_start,
            password: config.password.clone(),
        }
    }

    /// Find the next available port starting from 4096.
    fn next_port(&self) -> u16 {
        let configs = self.load_configs();
        let used_ports: Vec<u16> = configs.iter().map(|c| c.port).collect();
        let mut port = 4096u16;
        while used_ports.contains(&port) {
            port += 1;
        }
        port
    }

    /// Start a workspace's OpenCode server process.
    fn start(&self, config: &WorkspaceConfig) -> Result<(), String> {
        let mut processes = self.processes.lock().unwrap();
        if processes.contains_key(&config.id) {
            return Ok(()); // Already running
        }

        let mut cmd = Command::new("opencode");
        cmd.arg("serve")
            .arg("--port")
            .arg(config.port.to_string())
            .current_dir(&config.path);

        if let Some(ref password) = config.password {
            cmd.env("OPENCODE_SERVER_PASSWORD", password);
        }

        let child = cmd.spawn().map_err(|e| {
            format!(
                "Failed to start opencode serve for '{}': {}",
                config.name, e
            )
        })?;

        processes.insert(config.id.clone(), child);
        drop(processes);

        // Update discovery.json
        let _ = self.update_discovery();

        Ok(())
    }

    /// Stop a workspace's OpenCode server process.
    fn stop(&self, id: &str) -> Result<(), String> {
        let mut processes = self.processes.lock().unwrap();
        if let Some(mut child) = processes.remove(id) {
            let _ = child.kill();
            let _ = child.wait();
        }
        drop(processes);
        let _ = self.update_discovery();
        Ok(())
    }

    /// Auto-start workspaces marked with autoStart.
    pub fn auto_start(&self) -> Result<(), String> {
        let configs = self.load_configs();
        for config in configs.iter().filter(|c| c.auto_start) {
            if let Err(e) = self.start(config) {
                eprintln!("Failed to auto-start workspace '{}': {}", config.name, e);
            }
        }
        Ok(())
    }

    /// Update the discovery.json file for client discovery.
    fn update_discovery(&self) -> Result<(), String> {
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        let discovery_path = home.join(".opencode-hub").join("discovery.json");
        let configs = self.load_configs();
        let infos: Vec<WorkspaceInfo> = configs.iter().map(|c| self.config_to_info(c)).collect();

        let discovery = serde_json::json!({
            "workspaces": infos,
            "clients": [],
            "updatedAt": chrono::Utc::now().to_rfc3339(),
        });

        let json = serde_json::to_string_pretty(&discovery).map_err(|e| e.to_string())?;
        fs::write(discovery_path, json).map_err(|e| e.to_string())
    }
}

// ─── Tauri commands ──────────────────────────────────────────────

#[tauri::command]
pub fn list_workspaces(manager: tauri::State<WorkspaceManager>) -> Vec<WorkspaceInfo> {
    let configs = manager.load_configs();
    configs.iter().map(|c| manager.config_to_info(c)).collect()
}

#[tauri::command]
pub fn create_workspace(
    manager: tauri::State<WorkspaceManager>,
    input: CreateWorkspaceInput,
) -> Result<WorkspaceInfo, String> {
    let config = WorkspaceConfig {
        id: format!("ws-{}", Uuid::new_v4().to_string().split('-').next().unwrap()),
        name: input.name,
        path: input.path,
        port: input.port.unwrap_or_else(|| manager.next_port()),
        auto_start: input.auto_start.unwrap_or(false),
        password: input.password,
    };

    manager.save_config(&config)?;
    manager.start(&config)?;

    Ok(manager.config_to_info(&config))
}

#[tauri::command]
pub fn start_workspace(manager: tauri::State<WorkspaceManager>, id: String) -> Result<(), String> {
    let configs = manager.load_configs();
    let config = configs
        .iter()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("Workspace '{}' not found", id))?;
    manager.start(config)
}

#[tauri::command]
pub fn stop_workspace(manager: tauri::State<WorkspaceManager>, id: String) -> Result<(), String> {
    manager.stop(&id)
}

#[tauri::command]
pub fn delete_workspace(
    manager: tauri::State<WorkspaceManager>,
    id: String,
) -> Result<(), String> {
    manager.stop(&id)?;
    manager.delete_config(&id)
}
