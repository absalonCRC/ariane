mod storage;
mod outline;
pub use storage::*;
pub(crate) use outline::validate as validate_outline;

pub mod links;
