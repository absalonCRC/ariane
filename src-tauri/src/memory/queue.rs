use super::*;
use crate::{inference::Engine, memory_engine::Activity, memory_evidence};
use std::sync::Mutex;

pub const GEMMA_MODEL: &str = "embeddinggemma-300M-Q8_0:manuscript-outline-v2";

pub struct Queue<'a> {
    pub root: &'a Path,
    pub index: &'a Path,
    pub resources: &'a Path,
    pub engine: &'a Mutex<Engine>,
    pub activity: &'a Activity,
    pub critical_pressure: bool,
}

impl Queue<'_> {
    pub fn run(&self, section: &str, node: Option<&str>, revision: i64, depth: u8, semantic: bool,
    ) -> Result<Value> {
        if self.activity.is_writing() { return Ok(json!({"busy":true})); }
        let c = project::database(self.root)?;
        if project::section(&c, section)?.is_none_or(|s|s.revision != revision) {
            return Ok(json!({"stale":true}));
        }
        let settings: String = c.query_row("SELECT value FROM meta WHERE key='settings'", [], |r| {
                r.get(0)
            }).unwrap_or_else(|_|"{}".into());
        if serde_json::from_str::<Value>(&settings).ok().and_then(|s|s["enrichment"].as_bool()) == Some(false) {
            return Ok(json!({"entities":[],"recall":null,"anchorHash":"","pending":false}));
        }
        drop(c);
        // Cheap, useful results are independent of model availability and pressure.
        sync_idle(self.root, Some(section), ||self.activity.is_writing())?;
        let available = Engine::available(self.resources);
        let mut analyzed = 0;
        let mut model_error = None;
        let mut deferred = false;
        if semantic && available && depth > 0 {
            if self.critical_pressure || self.activity.blocked() {
                deferred = true;
            } else {
                // One passage per turn; a foreground request can take the shared
                // engine between forwards. Never wait for its mutex in this queue.
                for passage in pending_at(self.root, Some(section), node, 1)? {
                    let _priority = self.activity.inference();
                    let active = passage.section == section && passage.node.as_deref() == node;
                    let result = encode(&passage.text, active, |inputs| {
                        if self.activity.blocked() { return Ok(None); }
                        let Ok(mut engine) = self.engine.try_lock() else { return Ok(None); };
                        encoding_cache::encode_many(
                            self.root,
                            self.resources,
                            &mut engine,
                            &passage.title,
                            inputs, ||self.activity.blocked(),
                        )
                    });
                    match result {
                        Ok(Some(output)) if !self.activity.blocked() => {
                            if apply(self.root, &passage, &output)? { analyzed += 1; }
                        }
                        Ok(_) => deferred = true,
                        Err(e) => model_error = Some(e),
                    }
                }
            }
        }
        results::reconcile(self.root, self.index)?;
        let generation = results::catalog(self.root,self.index)?;
        let anchor = passage(self.root, section, node)?;
        let basic = context_idle(self.root, section, node, 0, ||self.activity.is_writing())?;
        let key = format!("context:{depth}:{section}:{}", node.unwrap_or(""));
        let encoded: Option<(i64,Option<String>,bool)> = storage::database(self.root)?.query_row(
            "SELECT analyzed,model,query_vector IS NOT NULL FROM memory_passages WHERE section=? AND node IS ?",
            params![section,node],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().app()?;
        let signature = storage::fingerprint(&format!("{anchor:?}:{basic}:{encoded:?}"));
        let vector_generation: i64 = storage::database(self.root)?.query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key='memory_vectors_generation'",[],|r|r.get(0)).optional().app()?.unwrap_or(0);
        let cached = results::get(self.root,&key,&signature)?;
        let cached = cached.filter(|value| {
            if value["recall"].is_null() { return depth == 0 || value["recallGeneration"].as_i64() == Some(vector_generation); }
            let Some(section) = value["recall"]["section"].as_str() else { return false; };
            let recalled = passage(self.root,section,value["recall"]["node"].as_str()).ok().flatten();
            recalled.is_some_and(|p| p.hash == value["recall"]["hash"].as_str().unwrap_or("")
                && anchor.as_ref().is_none_or(|a| a.section != p.section || a.position.abs_diff(p.position)>1))
        });
        let mut result = if let Some(value) = cached { value } else {
            let mut value = context_idle(self.root, section, node, depth, ||self.activity.is_writing())?;
            if depth > 0 {
                if let Some(passage) = &anchor {
                    value["evidence"] = json!(memory_evidence::suggest(self.root,self.index,passage)?);
                }
            }
            value["recallGeneration"] = json!(vector_generation);
            if value["busy"].as_bool() != Some(true) {
                results::put_if_current(self.root,self.index,&key,&signature,anchor.as_ref().map_or("",|p|p.text.as_str()),&value,&generation)?;
            }
            value
        };
        if result["busy"].as_bool() == Some(true) { return Ok(result); }
        if results::catalog(self.root,self.index)? != generation { return Ok(json!({"busy":true})); }
        result["analyzed"] = json!(analyzed);
        result["pending"] = json!(depth > 0 && available && !pending(self.root, Some(section), 1)?.is_empty());
        result["deferred"] = json!(deferred);
        result["modelError"] = json!(model_error);
        Ok(result)
    }
}

// Preserve a paragraph vector plus its individual ideas. Whitespace changes do
// not alter encoding, and long paragraphs are chunked by the existing engine.
fn encode(text: &str,
    active: bool,
    mut embed: impl FnMut(&[(&str, bool)]) -> Result<Option<Vec<Vec<f32>>>>,
) -> Result<Option<Value>> {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut pieces = vec![normalized.as_str()];
    let sentences: Vec<&str> = normalized.split_inclusive(['.', '!', '?', ';']).map(str::trim).filter(|s|s.chars().count() > 15).collect();
    if sentences.len() > 1 { pieces.extend(sentences.into_iter().take(8)); }
    let mut inputs = Vec::new();
    for piece in pieces {
        inputs.push((piece, false));
        if active {
            inputs.push((piece, true));
        }
    }
    let Some(vectors) = embed(&inputs)? else {
        return Ok(None);
    };
    if vectors.len() != inputs.len() {
        return Err("Lot vectoriel incomplet.".into());
    }
    let mut passages = Vec::new();
    let mut queries = Vec::new();
    for ((_, query), vector) in inputs.iter().zip(vectors) {
        if *query {
            queries.push(vector); } else {
            passages.push(vector);
        }
    }
    Ok(Some(json!({"model":GEMMA_MODEL,"vector":passages[0],"queryVector":queries.first(),
        "passageVectors":passages,"queryVectors":if active { Some(queries) } else { None }}),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn an_empty_recall_is_revisited_when_background_vectors_become_available() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        let p = project::create(root,"Mémoire").unwrap();
        let id = &p.sections[0].id;
        project::save(root,vec![crate::model::TextPatch {id:id.clone(),revision:0,
            text:"Alpha.\nBeta.\nGamma.".into(),outline:Some(crate::model::Outline {version:1,nodes:vec![
                crate::model::OutlineNode{id:"a".into(),parent:None,start:0},
                crate::model::OutlineNode{id:"b".into(),parent:None,start:7},
                crate::model::OutlineNode{id:"c".into(),parent:None,start:13},
            ]})}]).unwrap();
        sync(root).unwrap();
        let mut vector = vec![0f32;768]; vector[0] = 1.;
        let output = json!({"vector":vector,"queryVector":vector,"model":GEMMA_MODEL});
        let first = passage(root,id,Some("a")).unwrap().unwrap();
        apply(root,&first,&output).unwrap();
        let engine = Mutex::new(Engine::default()); let activity = Activity::default();
        let index = root.join("sources.sqlite"); let resources = root.join("no-model");
        let q = Queue {root,index:&index,resources:&resources,engine:&engine,activity:&activity,critical_pressure:false};
        assert!(q.run(id,Some("a"),1,3,false).unwrap()["recall"].is_null());
        let last = passage(root,id,Some("c")).unwrap().unwrap();
        apply(root,&last,&output).unwrap();
        assert_eq!(q.run(id,Some("a"),1,3,false).unwrap()["recall"]["node"],"c");
    }
    #[test]
    fn an_edit_only_recomputes_its_logical_block_and_survives_reopening() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let project = project::create(root,"Blocs").unwrap();
        let id = &project.sections[0].id;
        let outline = |middle: &str| crate::model::Outline { version: 1, nodes: vec![
            crate::model::OutlineNode {id:"a".into(),parent:None,start:0},
            crate::model::OutlineNode {id:"b".into(),parent:None,start:7},
            crate::model::OutlineNode {id:"c".into(),parent:None,start:7+middle.encode_utf16().count()+1},
        ]};
        project::save(root,vec![crate::model::TextPatch {id:id.clone(),revision:0,text:"Alpha.\nBeta.\nGamma.".into(),outline:Some(outline("Beta."))}]).unwrap();
        let engine = Mutex::new(Engine::default());
        let activity = Activity::default();
        let index = root.join("sources.sqlite");
        let resources = root.join("no-model");
        let queue = Queue {root,index:&index,resources:&resources,engine:&engine,activity:&activity,critical_pressure:false};
        for node in ["a","b","c"] { queue.run(id,Some(node),1,0,false).unwrap(); }
        let c = storage::database(root).unwrap();
        c.execute_batch("CREATE TABLE writes(key TEXT); CREATE TRIGGER cache_changed AFTER UPDATE ON memory_results BEGIN INSERT INTO writes VALUES(new.key); END;").unwrap();
        project::save(root,vec![crate::model::TextPatch {id:id.clone(),revision:1,text:"Alpha.\n😀 Delta.\nGamma.".into(),outline:Some(outline("😀 Delta."))}]).unwrap();
        for node in ["a","b","c"] { queue.run(id,Some(node),2,0,false).unwrap(); }
        let changed:Vec<String> = c.prepare("SELECT key FROM writes").unwrap().query_map([],|r|r.get(0)).unwrap().collect::<std::result::Result<_,_>>().unwrap();
        assert_eq!(changed,vec![format!("context:0:{id}:b")]);
        let saved = queue.run(id,Some("a"),2,0,false).unwrap();
        drop(c);
        assert_eq!(queue.run(id,Some("a"),2,0,false).unwrap(),saved);
    }
    #[test]
    fn interrupted_encoding_never_returns_partial_vectors() {
        let output = encode("Une maison vide. Une demeure abandonnée.", true, |inputs| {
            assert_eq!(inputs.len(), 6);
            Ok(None)
        }).unwrap();
        assert!(output.is_none());
    }
}
