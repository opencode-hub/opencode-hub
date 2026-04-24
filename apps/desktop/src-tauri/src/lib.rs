mod workspace;

use tauri::{
    AppHandle, Emitter, Manager, WindowEvent,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

/// Rebuild the tray menu with current workspace state.
fn rebuild_tray_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let manager = app.state::<workspace::WorkspaceManager>();
    let configs = manager.list_all();
    let running: Vec<_> = configs
        .iter()
        .filter(|w| w.status == workspace::WorkspaceStatus::Running)
        .collect();
    let stopped: Vec<_> = configs
        .iter()
        .filter(|w| w.status != workspace::WorkspaceStatus::Running)
        .collect();

    let mut builder = MenuBuilder::new(app);

    // Active servers section
    if running.is_empty() {
        let no_servers =
            MenuItemBuilder::with_id("no_servers", "No active servers")
                .enabled(false)
                .build(app)?;
        builder = builder.item(&no_servers);
    } else {
        for ws in &running {
            // Green circle + name only (no port)
            let label = format!("\u{1F7E2} {}", ws.name);
            let item =
                MenuItemBuilder::with_id(&format!("ws_{}", ws.id), &label).build(app)?;
            builder = builder.item(&item);
        }
    }

    // Stopped servers (dimmed)
    if !stopped.is_empty() {
        builder = builder.separator();
        for ws in &stopped {
            let label = format!("\u{26AA} {}", ws.name);
            let item =
                MenuItemBuilder::with_id(&format!("ws_{}", ws.id), &label).build(app)?;
            builder = builder.item(&item);
        }
    }

    builder = builder.separator();

    // Standard actions
    let show = MenuItemBuilder::with_id("show", "Show Hub").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings...").build(app)?;
    builder = builder.items(&[&show, &settings]);

    builder = builder.separator();

    let quit = MenuItemBuilder::with_id("quit", "Quit OpenCode Hub").build(app)?;
    builder = builder.item(&quit);

    let menu = builder.build()?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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

            // ─── Build tray ─────────────────────────────────────
            let placeholder_menu = MenuBuilder::new(app).build()?;

            let _tray = TrayIconBuilder::with_id("main")
                .menu(&placeholder_menu)
                .show_menu_on_left_click(false)
                .tooltip("OpenCode Hub")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if id.starts_with("ws_") {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let ws_id = id.strip_prefix("ws_").unwrap_or("");
                            let _ = window.emit("select-workspace", ws_id);
                        }
                    } else {
                        match id {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "settings" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = window.emit("navigate", "settings");
                                }
                            }
                            "quit" => {
                                // Kill all running workspaces before quitting
                                let mgr = app.state::<workspace::WorkspaceManager>();
                                mgr.stop_all();
                                app.exit(0);
                            }
                            _ => {}
                        }
                    }
                })
                .build(app)?;

            // Build real menu with workspace state
            if let Err(e) = rebuild_tray_menu(&app_handle) {
                eprintln!("Failed to build tray menu: {}", e);
            }

            Ok(())
        })
        // ─── Close-to-tray: hide window instead of quitting ──
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Hide the window instead of closing it
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            workspace::list_workspaces,
            workspace::create_workspace,
            workspace::start_workspace,
            workspace::stop_workspace,
            workspace::delete_workspace,
            workspace::refresh_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OpenCode Hub");
}
