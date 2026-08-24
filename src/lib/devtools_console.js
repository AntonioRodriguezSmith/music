import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./tauri_env";

let installed = false;

function formatArg(arg) {
  if (typeof arg === "string") return arg;
  try {
    const json = JSON.stringify(arg);
    return json === undefined ? String(arg) : json;
  } catch {
    return String(arg);
  }
}

/**
 * Dev-only sink: mirrors every webview console message into the backend, which
 * appends it to `scripts\devtools\logs\console` (see the `devtools_log` command).
 * Wraps the original methods so DevTools still shows the messages normally.
 */
export function installDevtoolsConsoleSink() {
  if (installed || !isTauri() || !import.meta.env.DEV) return;
  installed = true;

  for (const level of ["log", "info", "warn", "error", "debug"]) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = (...args) => {
      try {
        const line = args.map(formatArg).join(" ");
        if (line) {
          // Fire-and-forget: a broken sink must never break the app.
          invoke("devtools_log", { level, line }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
      original(...args);
    };
  }
}
