static NATIVE_SHORTCUTS:std::sync::Mutex<std::collections::BTreeMap<String,Option<String>>>=std::sync::Mutex::new(std::collections::BTreeMap::new());
use tauri::{
    menu::{Menu, MenuItem, MenuItemKind, Submenu, PredefinedMenuItem},
    AppHandle,
};

pub fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    menu_for_language(app, "fr")
}

pub fn menu_for_language(app: &AppHandle, language: &str) -> tauri::Result<Menu<tauri::Wry>> {
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
            "Quitter ariane",
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
        ("focus", "Activer ou quitter le mode focus", Some("CmdOrCtrl+Shift+F")),
        ("binder", "Afficher ou masquer le classeur", Some("CmdOrCtrl+Shift+B")),
        ("commands", "Commandes…", Some("CmdOrCtrl+K")),
        ("sections", "Rejoindre une section…", Some("CmdOrCtrl+P")),
        ("sources", "Sources du projet…", None),
        ("entities", "Gérer les entités", None),
        ("smart-tags", "Gérer les smart-tags", None),
    ] { view.append(&MenuItem::with_id(app,id,label,true,shortcut)?)?; }
    if let Some(MenuItemKind::Submenu(old_view)) = menu.items()?.get(3) {
        view.append(&PredefinedMenuItem::separator(app)?)?;
        for item in old_view.items()? { view.append(&item)?; }
    }
    menu.remove_at(3)?;
    menu.insert(&view,3)?;
    localize_items(menu.items()?, language)?;
    if let Ok(stored)=NATIVE_SHORTCUTS.lock(){
        for (id,key) in stored.iter(){if let Some(item)=find_menu_item(menu.items()?,id)?{item.set_accelerator(key.as_deref())?;}}
    }
    Ok(menu)
}

// The same catalog serves React and the native menu bar.
fn text(value: &str, language: &str) -> String {
    let plain = value.replace('&', "");
    let source = match plain.as_str() {
        "Window" => "Fenêtre", "Help" => "Aide", "Edit" => "Édition",
        "About ariane" | "About" => "À propos d’ariane",
        "Hide ariane" | "Hide" => "Masquer ariane", "Hide Others" => "Masquer les autres",
        "Show All" => "Tout afficher", "Minimize" => "Réduire la fenêtre",
        "Zoom" | "Maximize" => "Agrandir", "Close Window" | "Close" => "Fermer la fenêtre",
        "Toggle Full Screen" => "Plein écran", "Undo" => "Annuler la dernière action", "Redo" => "Rétablir",
        "Cut" => "Couper", "Copy" => "Copier", "Paste" => "Coller", "Select All" => "Tout sélectionner",
        other => other,
    };
    if language == "fr" { return source.to_owned(); }
    static MESSAGES: std::sync::OnceLock<std::collections::HashMap<String, [String; 2]>> = std::sync::OnceLock::new();
    let messages = MESSAGES.get_or_init(|| serde_json::from_str(include_str!("../../src/i18n/messages.json")).expect("valid translation catalog"));
    messages.get(source).map(|values| values[usize::from(language == "es")].clone()).unwrap_or_else(|| source.to_owned())
}
fn localize_items(items: Vec<MenuItemKind<tauri::Wry>>, language: &str) -> tauri::Result<()> {
    for item in items {
        match item {
            MenuItemKind::Submenu(menu) => {
                menu.set_text(text(&menu.text()?, language))?;
                localize_items(menu.items()?, language)?;
            }
            MenuItemKind::MenuItem(item) => item.set_text(text(&item.text()?, language))?,
            MenuItemKind::Predefined(item) => {
                let label = item.text()?;
                if !label.is_empty() { item.set_text(text(&label, language))?; }
            }
            _ => {},
        }
    }
    Ok(())
}


fn find_menu_item(items:Vec<MenuItemKind<tauri::Wry>>,id:&str)->tauri::Result<Option<MenuItem<tauri::Wry>>>{
    for item in items {
        match item {
            MenuItemKind::MenuItem(item) if item.id().as_ref()==id => return Ok(Some(item)),
            MenuItemKind::Submenu(menu)=>if let Some(item)=find_menu_item(menu.items()?,id)?{return Ok(Some(item));},
            _=>{}
        }
    } Ok(None)
}

pub fn update_shortcuts(app:&AppHandle,bindings:&std::collections::BTreeMap<String,Option<String>>)->crate::error::Result<()> {
    use crate::error::AppResult;
    let menu=app.menu().ok_or("Menu indisponible.")?;
    // Keep the previous map so a rejected accelerator does not leave a partial update.
    let mut current=NATIVE_SHORTCUTS.lock().map_err(|e|e.to_string())?;
    if current.is_empty(){
        *current=[("new-project",Some("CmdOrCtrl+N")),("open-project",Some("CmdOrCtrl+O")),("import",Some("CmdOrCtrl+Shift+I")),("save",Some("CmdOrCtrl+S")),("export",Some("CmdOrCtrl+Shift+E")),("preferences",Some("CmdOrCtrl+,")),("search",Some("CmdOrCtrl+F")),("annotations",Some("CmdOrCtrl+Alt+M")),("focus",Some("CmdOrCtrl+Shift+F")),("binder",Some("CmdOrCtrl+Shift+B")),("commands",Some("CmdOrCtrl+K")),("sections",Some("CmdOrCtrl+P")),("history",None),("sources",None),("entities",None),("smart-tags",None)].into_iter().map(|(id,key)|(id.to_owned(),key.map(str::to_owned))).collect();
    }
    let mut changed:Vec<String>=vec![];
    for (id,key) in bindings {
        if let Some(item)=find_menu_item(menu.items().app()?,id).app()? {
            if let Err(error)=item.set_accelerator(key.as_deref()) {
                for previous in changed {if let Some(item)=find_menu_item(menu.items().app()?,&previous).app()? {item.set_accelerator(current.get(&previous).and_then(|v|v.as_deref())).app()?;}}
                return Err(error.to_string());
            }changed.push(id.clone());
        }
    }
    *current=bindings.clone();Ok(())
}

#[cfg(test)]
mod tests {
    use super::text;
    #[test]
    fn menu_labels_follow_the_application_language() {
        assert_eq!(text("Nouveau projet…", "en"), "New project…");
        assert_eq!(text("Nouveau projet…", "es"), "Nuevo proyecto…");
        assert_eq!(text("&Copy", "fr"), "Copier");
        assert_eq!(text("Hide Others", "es"), "Ocultar las demás");
        assert_eq!(text("Window", "fr"), "Fenêtre");
        assert_eq!(text("ariane", "en"), "ariane");
    }
}
