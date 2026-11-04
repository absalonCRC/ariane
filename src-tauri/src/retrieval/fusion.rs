//! Explicit lookup fuses ranks. Automatic suggestions keep their calibrated
//! confidence scale and never interpret an RRF value as an absolute confidence.
use super::*;

pub(super) fn search(
    snapshot: &cache::Snapshot,
    index: &Path,
    vector: &[f32],
    hits: HashMap<String, Source>,
    query: &str,
    threshold: f64,
) -> Result<Vec<Source>> {
    let data = &snapshot.sources;
    let mut lexical: Vec<_> = hits.into_values().collect();
    lexical.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.title.cmp(&b.title)));
    lexical.truncate(20);
    let mut scores = vec![f64::NEG_INFINITY; data.all.len()];
    let mut semantic: Vec<Source> = vec![];
    cache::visit_chunks(snapshot, index, |chunk| {
        let score = cosine(vector, &chunk.vector);
        if score < threshold || score <= scores[chunk.source] {
            return;
        }
        scores[chunk.source] = score;
        let source = &data.all[chunk.source];
        if let Some(i) = semantic.iter().position(|s| s.id == source.id) {
            semantic.remove(i);
        }
        if semantic.len() < 20
            || semantic
                .last()
                .is_some_and(|s| score > s.score || (score == s.score && source.title < s.title))
        {
            let mut source = source.clone();
            source.text = chunk.text.clone();
            source.page = chunk.page;
            source.score = score;
            semantic.push(source);
            semantic.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.title.cmp(&b.title)));
            semantic.truncate(20);
        }
    })?;
    let mut combined: HashMap<String, (Source, f64)> = HashMap::new();
    for (rank, source) in lexical.into_iter().enumerate() {
        combined.insert(source.id.clone(), (source, 1. / (60. + (rank + 1) as f64)));
    }
    for (rank, source) in semantic.into_iter().enumerate() {
        let entry = combined
            .entry(source.id.clone())
            .or_insert((source.clone(), 0.));
        entry.1 += 1. / (60. + (rank + 1) as f64);
        // Keep the best semantic passage as evidence, independent of chunk order.
        entry.0.text = source.text;
        entry.0.page = source.page;
    }
    let exact: HashSet<_> = data
        .aliases
        .iter()
        .filter(|(name, _)| name == query)
        .map(|(_, i)| data.all[*i].id.as_str())
        .collect();
    let mut out: Vec<_> = combined
        .into_values()
        .map(|(mut s, score)| {
            s.score = score
                + if exact.contains(s.id.as_str()) {
                    1.
                } else {
                    0.
                };
            s
        })
        .collect();
    out.sort_by(|a, b| b.score.total_cmp(&a.score).then(a.title.cmp(&b.title)));
    out.truncate(20);
    Ok(out)
}
