//! Central error type for Clip Harbour.
//!
//! Every Tauri command returns `Result<T, AppError>` so the frontend receives a
//! stable `{ code, message, detail }` shape instead of raw yt-dlp stderr. The
//! `code` maps to a friendly i18n message in `src/i18n/locales/*.json` (see
//! `errors.*`), with `message`/`detail` as fallbacks.

use serde::Serialize;

/// Machine-readable error codes. Keep in sync with the frontend dictionary in
/// `src/lib/app_errors.js` and the i18n keys `errors.<code>`.
///
/// This is a stable dictionary consumed by the frontend, so not every code has
/// a Rust producer today.
#[allow(dead_code)]
pub mod codes {
    pub const COOKIES_INVALID: &str = "COOKIES_INVALID";
    pub const COOKIES_NO_SESSION: &str = "COOKIES_NO_SESSION";
    pub const COOKIES_FILE_NOT_FOUND: &str = "COOKIES_FILE_NOT_FOUND";
    pub const RATE_LIMIT: &str = "RATE_LIMIT";
    pub const AUTH_BLOCK: &str = "AUTH_BLOCK";
    pub const DIR_ACCESS: &str = "DIR_ACCESS";
    pub const NO_RESULTS: &str = "NO_RESULTS";
    pub const YTDLP_SPAWN: &str = "YTDLP_SPAWN";
    pub const YTDLP_FAILED: &str = "YTDLP_FAILED";
    pub const NO_DATA: &str = "NO_DATA";
    pub const PARSE_JSON: &str = "PARSE_JSON";
    pub const INTERNAL: &str = "INTERNAL";
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub detail: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: String::new(),
        }
    }

    pub fn with_detail(
        code: impl Into<String>,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail: detail.into(),
        }
    }

    /// Wrap an opaque internal error (legacy string from yt-dlp / queue).
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(codes::INTERNAL, message)
    }

    /// Stable status string used by the download registry (`error: <message>`).
    /// Kept for compatibility with `download_status.js`.
    pub fn to_status_string(&self) -> String {
        let msg = self.message.trim();
        if msg.starts_with("error") {
            msg.to_string()
        } else {
            format!("error: {msg}")
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.detail.is_empty() {
            write!(f, "{}", self.message)
        } else {
            write!(f, "{}: {}", self.message, self.detail)
        }
    }
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        Self::internal(value)
    }
}

impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        Self::internal(value)
    }
}
