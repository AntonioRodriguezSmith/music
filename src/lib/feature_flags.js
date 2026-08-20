// Player (Fase 4) es una característica en desarrollo: habilitada en dev
// (`npm run dev`), desactivada en el build standalone de producción (`tauri build`).
// Override explícito: forzar VITE_ENABLE_PLAYER=1 para incluirlo en una release.
export const PLAYER_ENABLED =
  import.meta.env.VITE_ENABLE_PLAYER === "1" ? true : !import.meta.env.PROD;
