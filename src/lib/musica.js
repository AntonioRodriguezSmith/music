import { invoke } from "@tauri-apps/api/core";

/** @returns {Promise<{available: boolean, scriptsDir: string, error: ?string}>} */
export function musicaAvailable() {
  return invoke("musica_available");
}

/**
 * @param {{dir: string, step: number, apply: boolean, deleteDuplicates: boolean, removeJunk: boolean}} opts
 */
export function musicaRun({ dir, step, apply, deleteDuplicates, removeJunk }) {
  return invoke("musica_run", {
    dir,
    step,
    apply,
    delete_duplicates: deleteDuplicates,
    remove_junk: removeJunk,
  });
}

export function musicaCancel() {
  return invoke("musica_cancel");
}
