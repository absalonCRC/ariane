use super::*;
use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRef {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub path: String,
    pub vault_id: String,
    #[serde(skip)]
    aliases: Vec<String>,
}
pub(super) fn catalog(root: &Path, index: &Path) -> Result<Vec<NoteRef>> {
    let available = list(root, index)?;
    let c = index_db(index)?;
    let mut q = c.prepare("SELECT id,vault,path,json_extract(payload,'$.title'),json_extract(payload,'$.kind'),json_extract(payload,'$.aliases') FROM sources WHERE lower(path) LIKE '%.md'").app()?;
    let rows = q
        .query_map([], |r| {
            Ok(NoteRef {
                id: r.get(0)?,
                vault_id: r.get(1)?,
                path: r.get(2)?,
                title: r.get(3)?,
                kind: r.get(4)?,
                aliases: serde_json::from_str(&r.get::<_, String>(5)?).unwrap_or_default(),
            })
        })
        .app()?;
    rows.filter_map(|row| match row {
        Ok(note)
            if available.iter().any(|v| {
                v.available
                    && v.id == note.vault_id
                    && (v.scope.is_empty()
                        || v.scope.iter().any(|s| Path::new(&note.path).starts_with(s)))
            }) =>
        {
            Some(Ok(note))
        }
        Ok(_) => None,
        Err(e) => Some(Err(e.to_string())),
    })
    .collect()
}
fn folded(value: &str) -> String {
    parse::normalize(value)
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}
fn distance(a: &str, b: &str) -> usize {
    let b: Vec<_> = b.chars().collect();
    let mut row: Vec<_> = (0..=b.len()).collect();
    for (i, x) in a.chars().enumerate() {
        let mut diagonal = row[0];
        row[0] = i + 1;
        for (j, y) in b.iter().enumerate() {
            let before = row[j + 1];
            row[j + 1] = (row[j] + 1)
                .min(before + 1)
                .min(diagonal + usize::from(x != *y));
            diagonal = before;
        }
    }
    row[b.len()]
}
fn rank(name: &str, query: &str) -> Option<usize> {
    let name = folded(name);
    if name == query {
        return Some(0);
    }
    if name.starts_with(query) {
        return Some(1);
    }
    if name.contains(query) {
        return Some(2);
    }
    if query.len() >= 3 {
        let mut letters = name.chars();
        if query.chars().all(|c| letters.any(|x| x == c)) {
            return Some(3);
        }
    }
    if query.chars().count() >= 5
        && name.chars().count().abs_diff(query.chars().count()) <= 3
        && distance(&name, query) <= if query.chars().count() >= 8 { 3 } else { 1 }
    {
        return Some(4);
    }
    None
}
pub fn note_references(root:&Path,index:&Path,ids:&[String]) -> Result<Vec<NoteRef>> {
    Ok(catalog(root,index)?.into_iter().filter(|n|ids.contains(&n.id)).collect())
}
pub fn suggest_notes(root: &Path, index: &Path, query: &str) -> Result<Vec<NoteRef>> {
    if query.chars().count() > 120 {
        return Ok(vec![]);
    }
    let query = folded(query);
    let mut matches: Vec<_> = catalog(root, index)?
        .into_iter()
        .filter_map(|note| {
            let rank = std::iter::once(note.title.as_str())
                .chain(note.aliases.iter().map(String::as_str))
                .filter_map(|name| rank(name, &query))
                .min()?;
            Some((rank, note))
        })
        .collect();
    matches.sort_by(|a, b| (a.0, &a.1.title, &a.1.id).cmp(&(b.0, &b.1.title, &b.1.id)));
    Ok(matches.into_iter().take(20).map(|(_, note)| note).collect())
}
pub fn create_quick_note(root: &Path, index: &Path, name: &str) -> Result<Source> {
    let key = folded(name);
    if key.is_empty() || name.chars().count() > 120 || name.contains(['\n', '\r', '/', '\\', ':']) {
        return Err("Nom de note invalide.".into());
    }
    let matches: Vec<_> = catalog(root, index)?
        .into_iter()
        .filter(|note| {
            std::iter::once(note.title.as_str())
                .chain(note.aliases.iter().map(String::as_str))
                .any(|name| folded(name) == key)
        })
        .collect();
    if matches.len() > 1 {
        return Err("Plusieurs notes portent ce nom. Utilisez @ pour choisir la note.".into());
    }
    if let Some(note) = matches.first() {
        return source(index, &note.id, &list(root, index)?);
    }
    if !list(root, index)?.iter().any(|v| v.owned && v.available) {
        create_owned(root)?;
    }
    let path = create_entity(root, "note", name.trim(), "")?;
    index_created_entity(root, index, &path)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_compact_names_and_aliases_and_creates_once() {
        let d = tempfile::tempdir().unwrap();
        let index = d.path().join("sources.sqlite");
        create_project(d.path(), "Notes", None).unwrap();
        let note = create_quick_note(d.path(), &index, "Claude Nougaro").unwrap();
        assert_eq!(
            suggest_notes(d.path(), &index, "claudenougaro").unwrap()[0].id,
            note.id
        );
        assert_eq!(
            create_quick_note(d.path(), &index, "claudenougaro")
                .unwrap()
                .id,
            note.id
        );
        assert_eq!(
            suggest_notes(d.path(), &index, "claudenogaro").unwrap()[0].id,
            note.id
        );
        assert!(create_quick_note(d.path(), &index, "../outside").is_err());
        assert_eq!(
            all(&index, &list(d.path(), &index).unwrap()).unwrap().len(),
            1
        );
    }
}
