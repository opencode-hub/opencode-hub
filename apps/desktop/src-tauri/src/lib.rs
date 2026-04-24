mod workspace;

use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
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

            // ─── Tray menu ──────────────────────────────────────
            let show_item = MenuItem::with_id(app, "show", "Show Hub", true, None::<&str>)?;
            let separator = MenuItem::with_id(app, "sep", "────────────", false, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit OpenCode Hub", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &separator, &settings_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    // Left-click: toggle window visibility
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
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "settings" => {
                            // Show window and navigate to settings (via event)
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", "settings");
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

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
