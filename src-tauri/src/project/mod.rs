mod guard;
pub(crate) mod io;
mod storage;
pub(crate) mod tree;
pub(crate) use guard::with_lock;
pub use guard::ProjectGuard;
pub(crate) use io::validate_id;
pub mod library;
mod mirrors;
mod mutations;
mod outline;
mod queries;
mod schema;
pub use mirrors::resolve_external;
pub(crate) use mirrors::scene_disk;
#[cfg(any(test, feature = "performance-harness"))]
pub use mutations::add;
pub use mutations::{create, reorder, settings, update};
pub(crate) use queries::row_section;
pub use queries::{all_sections, section, sections};
pub(crate) use schema::backup_before_migration;
pub use schema::database;
pub(crate) use storage::load_unlocked;
#[cfg(any(test, feature = "performance-harness"))]
pub use storage::save;
pub use storage::{hash, load, save_report};

pub(crate) use outline::validate as validate_outline;

pub mod links;

pub mod catalog;

pub mod annotations;
pub mod manuscript;

pub mod activity;
pub mod tags;
