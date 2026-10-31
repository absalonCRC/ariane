use tauri::{
    menu::{Menu, MenuItem, MenuItemKind},
    AppHandle,
};

pub fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(app)?;
    #[cfg(target_os = "macos")]
    if let Some(MenuItemKind::Submenu(application)) = menu.items()?.first() {
        // The predefined macOS Quit calls NSApplication.terminate directly.
        // Our item first asks the editor to make its pending text durable.
        let count = application.items()?.len();
        if count > 0 {
            application.remove_at(count - 1)?;
        }
        application.append(&MenuItem::with_id(
            app,
            "quit-after-save",
            "Quitter Ariane",
            true,
            Some("CmdOrCtrl+Q"),
        )?)?;
    }
    Ok(menu)
}
