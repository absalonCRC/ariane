//! Versioned little-endian f32 representation. Legacy JSON remains readable
//! while the derived source index is migrated in bounded batches.
use rusqlite::types::ValueRef;
const DIMENSION: usize = 768;
pub fn encode(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(8 + vector.len() * 4);
    bytes.extend_from_slice(b"AV01");
    bytes.extend_from_slice(&(vector.len() as u32).to_le_bytes());
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}
pub fn decode(value: ValueRef<'_>) -> Option<Vec<f32>> {
    let vector = match value {
        ValueRef::Blob(bytes)
            if bytes.len() == 8 + DIMENSION * 4
                && &bytes[..4] == b"AV01"
                && u32::from_le_bytes(bytes[4..8].try_into().ok()?) as usize == DIMENSION =>
        {
            bytes[8..]
                .chunks_exact(4)
                .map(|v| f32::from_le_bytes(v.try_into().unwrap()))
                .collect::<Vec<_>>()
        }
        ValueRef::Text(bytes) if bytes.len() <= 64 * 1024 => {
            serde_json::from_slice::<Vec<f32>>(bytes).ok()?
        }
        _ => return None,
    };
    (vector.len() == DIMENSION && vector.iter().all(|v| v.is_finite())
        && (0.9..=1.1).contains(&vector.iter().map(|v| v * v).sum::<f32>())).then_some(vector)
}
pub fn encode_group(vectors: &[Vec<f32>]) -> Vec<u8> {
    let mut bytes = b"AM01".to_vec();
    bytes.extend_from_slice(&(vectors.len() as u32).to_le_bytes());
    for vector in vectors {
        bytes.extend_from_slice(&encode(vector));
    }
    bytes
}
pub fn decode_group(value: ValueRef<'_>) -> Option<Vec<Vec<f32>>> {
    let vectors: Vec<Vec<f32>> = match value {
        ValueRef::Text(bytes) if bytes.len() <= 1024 * 1024 => {
            serde_json::from_slice(bytes).ok().or_else(|| {
                serde_json::from_slice::<Vec<f32>>(bytes)
                    .ok()
                    .map(|v| vec![v])
            })?
        }
        ValueRef::Blob(bytes) if bytes.len() >= 8 && &bytes[..4] == b"AM01" => {
            let count = u32::from_le_bytes(bytes[4..8].try_into().ok()?) as usize;
            if !(1..=9).contains(&count) || bytes.len() != 8 + count * (8 + DIMENSION * 4) {
                return None;
            }
            bytes[8..]
                .chunks_exact(8 + DIMENSION * 4)
                .map(|b| decode(ValueRef::Blob(b)))
                .collect::<Option<Vec<_>>>()?
        }
        _ => return None,
    };
    if vectors.is_empty() || vectors.len() > 9 {
        return None;
    }
    let dim = vectors[0].len();
    vectors
        .iter()
        .all(|v| {
            [384, 768].contains(&dim)
                && v.len() == dim
                && v.iter().all(|v| v.is_finite())
                && (0.9..=1.1).contains(&v.iter().map(|x| x * x).sum::<f32>())
        })
        .then_some(vectors)
}
pub fn migrate_batch(c: &rusqlite::Connection) -> crate::error::Result<()> {
    use crate::error::AppResult;
    let tx = c.unchecked_transaction().app()?;
    let rows = {
        let mut q=tx.prepare("SELECT id,CASE WHEN length(vector)<=65536 THEN vector ELSE NULL END FROM chunks WHERE typeof(vector)='text' LIMIT 512").app()?;
        let rows = q
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, decode(r.get_ref(1)?))))
            .app()?;
        rows.collect::<std::result::Result<Vec<_>, _>>().app()?
    };
    for (id, vector) in rows {
        tx.execute(
            "UPDATE chunks SET vector=? WHERE id=?",
            rusqlite::params![vector.map(|v| encode(&v)), id],
        )
        .app()?;
    }
    tx.commit().app()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn binary_roundtrip_is_exact_and_bad_dimensions_are_rejected() {
        let mut vector = (0..768).map(|i| i as f32 / 768.).collect::<Vec<_>>();
        let norm = vector.iter().map(|v| v * v).sum::<f32>().sqrt();
        for v in &mut vector {
            *v /= norm;
        }
        let binary = encode(&vector);
        assert_eq!(decode(ValueRef::Blob(&binary)), Some(vector.clone()));
        assert!(binary.len() < serde_json::to_string(&vector).unwrap().len());
        assert!(decode(ValueRef::Blob(&encode(&[1., 2.]))).is_none());
        assert!(decode(ValueRef::Blob(&encode(&vec![0.; 768]))).is_none());
        let mut invalid = vector;
        invalid[0] = f32::NAN;
        assert!(decode(ValueRef::Blob(&encode(&invalid))).is_none());
    }
}
