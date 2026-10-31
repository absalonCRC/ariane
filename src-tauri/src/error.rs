pub type Result<T> = std::result::Result<T, String>;
pub trait AppResult<T> {
    fn app(self) -> Result<T>;
}
impl<T, E: std::fmt::Display> AppResult<T> for std::result::Result<T, E> {
    fn app(self) -> Result<T> {
        self.map_err(|e| e.to_string())
    }
}
