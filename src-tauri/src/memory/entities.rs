use crate::error::{AppResult, Result};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::{json, Value};
use unicode_normalization::UnicodeNormalization;

fn normalized(s: &str) -> String {
    s.nfkc()
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn mention(
    tx: &Transaction<'_>,
    key: &str,
    text: &str,
    label: &str,
    start: usize,
    end: usize,
    origin: &str,
) -> Result<()> {
    if start >= end || text.get(start..end) != Some(label) {
        return Err("Mention hors du passage ou mal alignée.".into());
    }
    let entity_type = origin.strip_prefix("model:").unwrap_or(origin);
    let kind = match entity_type {
        "person" | "personne" => "person",
        "place" | "location" | "lieu" => "place",
        "organization" | "organisation" => "organization",
        "work" | "œuvre" => "work",
        "event" | "événement" => "event",
        other if other.starts_with("custom:") => other,
        _ => return Err("Type d'entité inconnu.".into()),
    };
    if kind == "person" && !origin.starts_with("model:") && label.split_whitespace().count() < 2 {
        return Ok(());
    }
    // An unconfirmed mention is not a globally unique identity.
    let name = format!("mention:{key}:{start}:{kind}:{}", normalized(label));
    if name.is_empty() {
        return Err("Nom d'entité vide.".into());
    }
    let id: Option<String> = tx
        .query_row(
            "SELECT id FROM memory_entities WHERE normalized=?",
            [&name],
            |r| r.get(0),
        )
        .optional()
        .app()?;
    let id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    tx.execute(
        "INSERT INTO memory_entities(id,title,normalized,kind) VALUES(?,?,?,?) ON CONFLICT(normalized) DO UPDATE SET title=excluded.title",
        params![id, label, name, kind],
    )
    .app()?;
    tx.execute("INSERT OR IGNORE INTO memory_mentions(passage_key,entity_id,start,end,origin) VALUES(?,?,?,?,?)",params![key,id,start as i64,end as i64,origin]).app()?;
    Ok(())
}

pub(super) fn rules(tx: &Transaction<'_>, p: &super::Passage) -> Result<()> {
    // Rules only propose full names. Single-word names require a confident model span.
    static RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"\b[\p{Lu}][\p{L}'’\-]+(?:\s+[\p{Lu}][\p{L}'’\-]+)+\b").unwrap()
    });
    for m in RE.find_iter(&p.text) {
        let value = m.as_str();
        if value.split_whitespace().count() > 4
            || value
                .split_whitespace()
                .next()
                .is_some_and(|w| ["Le", "La", "Les", "Un", "Une", "Des"].contains(&w))
        {
            continue;
        }
        let after = p.text[m.end()..].trim_start();
        if ![
            ",", "est ", "était ", "vit ", "habite ", "s’", "s\'", "naît ", "mourut ", "arrive ",
        ]
        .iter()
        .any(|prefix| after.starts_with(prefix))
        {
            continue;
        }
        mention(tx, &p.key, &p.text, value, m.start(), m.end(), "person")?;
    }
    Ok(())
}

pub(super) fn list(c: &Connection) -> Result<Value> {
    let mut q=c.prepare("SELECT e.id,e.title,e.kind,COUNT(DISTINCT m.passage_key) FROM memory_entities e JOIN memory_mentions m ON m.entity_id=e.id JOIN memory_passages p ON p.key=m.passage_key GROUP BY e.id ORDER BY e.title").app()?;
    let rows=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"title":r.get::<_,String>(1)?,"kind":r.get::<_,String>(2)?,"passageCount":r.get::<_,i64>(3)?}))).app()?;
    Ok(Value::Array(
        rows.collect::<std::result::Result<Vec<_>, _>>().app()?,
    ))
}

pub(super) fn read(c: &Connection, id: &str) -> Result<Value> {
    let (title, kind): (String, String) = c
        .query_row(
            "SELECT title,kind FROM memory_entities WHERE id=?",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .app()?
        .ok_or("Fiche introuvable.")?;
    let mut q=c.prepare("SELECT DISTINCT p.section,p.node,p.title,p.text,p.hash,m.start,m.end FROM memory_mentions m JOIN memory_passages p ON p.key=m.passage_key WHERE m.entity_id=? ORDER BY p.section,p.position").app()?;
    let rows = q
        .query_map([id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)? as usize,
                r.get::<_, i64>(6)? as usize,
            ))
        })
        .app()?;
    let legacy: bool = c
        .query_row(
            "SELECT normalized NOT LIKE 'mention:%' FROM memory_entities WHERE id=?",
            [id],
            |r| r.get(0),
        )
        .app()?;
    let mut passages = Vec::new();
    let mut timeline = Vec::new();
    let mut fields = Vec::new();
    for row in rows {
        let (section, node, ptitle, text, hash, start, end) = row.app()?;
        let Some(live) = crate::project::section(c, &section)? else {
            continue;
        };
        if !super::section_passages(&live)?
            .iter()
            .any(|p| p.node == node && p.hash == hash)
        {
            continue;
        }
        if end > text.len() || !text.is_char_boundary(start) || !text.is_char_boundary(end) {
            continue;
        }
        let quote = super::temporal::sentence(&text, start, end).to_owned();
        passages
            .push(json!({"section":section,"node":node,"title":ptitle,"quote":quote,"hash":hash}));
        let named = &text[start..end];
        if quote.matches(named).count() > 1 {
            continue;
        }
        let quote_start = text.find(&quote).unwrap_or(start);
        for date in super::temporal::dates(&text).into_iter().filter(|d| {
            d["start"].as_u64().is_some_and(|v| {
                v as usize >= quote_start && (v as usize) < quote_start + quote.len()
            })
        }) {
            timeline.push(json!({"date":date["date"],"expression":date["expression"],"precision":date["precision"],"approximate":date["approximate"],"uncertain":super::temporal::uncertain(&quote),"text":quote,"section":section,"node":node,"quote":quote}));
        }
        // Only explicit appositions are surfaced as factual fields.
        let pattern = format!(
            r"{}\s*,\s*([\p{{Ll}}][\p{{L}}-]{{2,30}})\s*[,.;]",
            regex::escape(named)
        );
        if let Ok(re) = regex::Regex::new(&pattern) {
            if super::temporal::uncertain(&quote) {
                continue;
            }
            if let Some(cap) = re.captures(&quote) {
                fields.push(json!({"name":"description","value":cap[1],"section":section,"node":node,"quote":quote}));
            }
        }
    }
    if legacy && passages.len() > 1 {
        timeline.clear();
        fields.clear();
    }
    timeline.sort_by_key(|event| event["date"].as_str().unwrap_or("~").to_owned());
    timeline.dedup();
    passages.dedup();
    fields.dedup();
    Ok(
        json!({"id":id,"title":title,"kind":kind,"passages":passages,"timeline":timeline,"fields":fields,"unresolved":true}),
    )
}
