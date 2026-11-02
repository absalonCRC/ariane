use tauri::{
    menu::{Menu, MenuItem, MenuItemKind, Submenu, PredefinedMenuItem},
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
    if let Some(MenuItemKind::Submenu(application)) = menu.items()?.first() {
        application.insert(&MenuItem::with_id(app, "preferences", "Réglages…", true, Some("CmdOrCtrl+,"))?, 1)?;
    }
    let file = Submenu::new(app, "Fichier", true)?;
    for (id, label, shortcut) in [
        ("new-project", "Nouveau projet…", Some("CmdOrCtrl+N")),
        ("open-project", "Ouvrir un projet…", Some("CmdOrCtrl+O")),
        ("import", "Importer un manuscrit…", Some("CmdOrCtrl+Shift+I")),
        ("save", "Enregistrer", Some("CmdOrCtrl+S")),
        ("export", "Exporter…", Some("CmdOrCtrl+Shift+E")),
        ("history", "Versions…", None),
    ] { file.append(&MenuItem::with_id(app, id, label, true, shortcut)?)?; }
    file.append(&PredefinedMenuItem::separator(app)?)?;
    file.append(&PredefinedMenuItem::close_window(app, Some("Fermer la fenêtre"))?)?;
    menu.remove_at(1)?;
    menu.insert(&file, 1)?;
    if let Some(MenuItemKind::Submenu(edit)) = menu.items()?.get(2) {
        edit.set_text("Édition")?;
        edit.append(&PredefinedMenuItem::separator(app)?)?;
        for (id,label,shortcut) in [
            ("search", "Rechercher…", Some("CmdOrCtrl+F")),
            ("manuscript", "Réorganiser le texte…", None),
            ("annotations", "Annoter la sélection / Voir les annotations", Some("CmdOrCtrl+Alt+M")),
        ] { edit.append(&MenuItem::with_id(app,id,label,true,shortcut)?)?; }
    }
    let view = Submenu::new(app, "Présentation", true)?;
    for (id,label,shortcut) in [
        ("binder", "Afficher ou masquer le classeur", Some("CmdOrCtrl+Shift+B")),
        ("commands", "Commandes…", Some("CmdOrCtrl+K")),
        ("sections", "Rejoindre une section…", Some("CmdOrCtrl+P")),
        ("sources", "Sources du projet…", None),
    ] { view.append(&MenuItem::with_id(app,id,label,true,shortcut)?)?; }
    if let Some(MenuItemKind::Submenu(old_view)) = menu.items()?.get(3) {
        view.append(&PredefinedMenuItem::separator(app)?)?;
        for item in old_view.items()? { view.append(&item)?; }
    }
    menu.remove_at(3)?;
    menu.insert(&view,3)?;
    Ok(menu)
}
