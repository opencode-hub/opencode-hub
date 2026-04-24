mod workspace;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize workspace manager
            let app_handle = app.handle().clone();
            let manager = workspace::WorkspaceManager::new()?;
            app.manage(manager);

            // Auto-start workspaces marked with autoStart
            let manager_ref = app_handle.state::<workspace::WorkspaceManager>();
            if let Err(e) = manager_ref.auto_start() {
                eprintln!("Failed to auto-start workspaces: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace::list_workspaces,
            workspace::create_workspace,
            workspace::start_workspace,
            workspace::stop_workspace,
            workspace::delete_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenCode Hub");
}
