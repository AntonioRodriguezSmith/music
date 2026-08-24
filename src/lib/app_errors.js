//! Central error handling for the frontend.
//!
//! The Rust backend returns `AppError { code, message, detail }` from every
//! Tauri command. Tauri v2 serializes it to a JSON string, so `parseAppError`
//! normalizes that (or any legacy string) into a stable shape, and
//! `friendlyError` resolves the friendliest user-facing message: i18n key
//! `errors.<code>` → dictionary fallback → backend `message`/`detail`.

const UNKNOWN = "INTERNAL";

/**
 * @typedef {{ code: string, message: string, detail: string }} ParsedError
 */

/**
 * @param {unknown} e
 * @returns {ParsedError}
 */
export function parseAppError(e) {
  if (e && typeof e === "object" && typeof e.code === "string") {
    return { code: e.code, message: e.message || "", detail: e.detail || "" };
  }
  if (typeof e === "string" && e.length > 0) {
    try {
      const parsed = JSON.parse(e);
      if (parsed && typeof parsed.code === "string") {
        return {
          code: parsed.code,
          message: parsed.message || "",
          detail: parsed.detail || "",
        };
      }
    } catch {
      // Not JSON: treat as a plain legacy message.
    }
    return { code: UNKNOWN, message: e, detail: "" };
  }
  return {
    code: UNKNOWN,
    message: e?.message || String(e ?? ""),
    detail: "",
  };
}

/**
 * Fallback per-code messages, shown when the i18n key is missing (e.g. the
 * current locale file is out of date). Must stay in sync with `errors.*` in
 * `src/i18n/locales/*.json`.
 */
export const ERROR_FALLBACKS = {
  COOKIES_INVALID:
    "El archivo de cookies no es válido. Exporta cookies reales (Netscape) y elígela en la sidebar.",
  COOKIES_NO_SESSION:
    "Las cookies no tienen una sesión de YouTube (faltan SID/HSID). Inicia sesión en el navegador y reintenta.",
  COOKIES_FILE_NOT_FOUND:
    "El archivo de cookies no existe. Revisa la ruta en la sidebar.",
  RATE_LIMIT:
    "YouTube ha limitado esta sesión (hasta ~1 hora). Espera un rato y evita lanzar varios vídeos seguidos.",
  AUTH_BLOCK:
    "YouTube pide confirmar que no eres un bot. Configura un cookies.txt en la sidebar o espera unos minutos.",
  DIR_ACCESS:
    "No se pudo crear la carpeta de descarga (permiso denegado). Elige otra carpeta.",
  NO_RESULTS: "No se encontraron resultados para esa búsqueda.",
  YTDLP_SPAWN: "No se pudo lanzar yt-dlp. Vuelve a intentarlo o revisa la instalación.",
  YTDLP_FAILED: "yt-dlp no pudo completar la operación.",
  NO_DATA: "yt-dlp no devolvió datos. Inténtalo de nuevo.",
  PARSE_JSON: "No se pudo interpretar la respuesta de YouTube.",
  INTERNAL: "Ocurrió un error inesperado.",
};

/**
 * Friendliest message to show the user. Prefers the i18n translation, then the
 * per-code fallback, then the backend message, and appends technical `detail`
 * below the friendly text when available.
 *
 * @param {unknown} e
 * @param {import("i18next").TFunction} [t]
 * @returns {string}
 */
export function friendlyError(e, t) {
  const parsed = parseAppError(e);
  // INTERNAL: keep the concrete backend/legacy message — the generic fallback
  // is only a last resort when there is no real text.
  if (parsed.code === "INTERNAL" && parsed.message) {
    return appendDetail(parsed.message, parsed.detail);
  }
  const key = `errors.${parsed.code}`;
  if (t && typeof t === "function") {
    const translated = t(key, { defaultValue: "" });
    if (translated && translated !== key) {
      return appendDetail(translated, parsed.detail);
    }
  }
  const fallback = ERROR_FALLBACKS[parsed.code];
  if (fallback) return appendDetail(fallback, parsed.detail);
  return appendDetail(parsed.message || parsed.detail || "Error", parsed.detail);
}

function appendDetail(message, detail) {
  if (detail && detail !== message && !message.includes(detail)) {
    return `${message}\n\n${detail}`;
  }
  return message;
}
