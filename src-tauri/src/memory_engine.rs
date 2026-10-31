//! Cooperative scheduling: suggestions take priority over the isolated CPU entity worker.
use std::sync::{atomic::{AtomicBool, AtomicUsize, Ordering}, Mutex};
mod worker;
pub use worker::EntityEngine;

pub fn critical_memory_pressure() -> bool {
    let mut level: i32 = 0;
    let mut size = std::mem::size_of::<i32>();
    let status = unsafe {
        libc::sysctlbyname(c"kern.memorystatus_vm_pressure_level".as_ptr(),
            (&mut level as *mut i32).cast(), &mut size, std::ptr::null_mut(), 0)
    };
    // Warning (2) still permits the existing, shared Gemma engine. Only critical
    // pressure (4) defers new forwards; derived facts and cached recall stay live.
    status == 0 && level >= 4
}

#[derive(Default)]
pub struct Activity {
    writing: AtomicBool,
    foreground: AtomicUsize,
    embedding: AtomicUsize,
    pid: Mutex<Option<i32>>,
}
impl Activity {
    pub fn is_writing(&self) -> bool {
        self.writing.load(Ordering::SeqCst)
    }
    pub fn blocked(&self) -> bool {
        self.is_writing() || self.foreground.load(Ordering::SeqCst) > 0
    }
    pub fn cancel_entities(&self) {
        let pid = self.pid.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pid) = *pid { unsafe { libc::kill(pid, libc::SIGKILL); } }
    }
    fn signal(&self) {
        let pid = self.pid.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pid) = *pid {
            unsafe { libc::kill(pid, if self.ner_blocked() { libc::SIGSTOP } else { libc::SIGCONT }); }
        }
    }
    pub fn ner_blocked(&self) -> bool {
        self.blocked() || self.embedding.load(Ordering::SeqCst) > 0
    }
    pub fn inference(&self) -> Inference<'_> {
        self.embedding.fetch_add(1, Ordering::SeqCst);
        self.signal();
        Inference(self)
    }
    #[cfg(feature = "performance-harness")]
    pub fn ner_pid(&self) -> Option<i32> {
        *self.pid.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn writing(&self, active: bool) {
        self.writing.store(active, Ordering::SeqCst);
        self.signal();
    }
    pub fn foreground(&self) -> Foreground<'_> {
        self.foreground.fetch_add(1, Ordering::SeqCst);
        self.signal();
        Foreground(self)
    }
}
pub struct Foreground<'a>(&'a Activity);
impl Drop for Foreground<'_> {
    fn drop(&mut self) {
        self.0.foreground.fetch_sub(1, Ordering::SeqCst);
        self.0.signal();
    }
}

pub struct Inference<'a>(&'a Activity);
impl Drop for Inference<'_> {
    fn drop(&mut self) {
        self.0.embedding.fetch_sub(1, Ordering::SeqCst);
        self.0.signal();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn entity_priority_does_not_block_shared_gemma_and_nested_searches_resume_safely() {
        let activity = Activity::default();
        let embedding = activity.inference();
        assert!(activity.ner_blocked());
        assert!(!activity.blocked());
        let search = activity.foreground();
        let other = activity.foreground();
        drop(search);
        assert!(activity.blocked());
        drop(other);
        assert!(!activity.blocked());
        assert!(activity.ner_blocked());
        activity.writing(true);
        drop(embedding);
        assert!(activity.ner_blocked());
        activity.writing(false);
        assert!(!activity.ner_blocked());
    }
}
