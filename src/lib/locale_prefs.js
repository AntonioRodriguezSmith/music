const LOCALE_KEY = "clip_harbour_locale";

export function loadLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === "es") return stored;
  } catch {
    /* ignore */
  }
  return "es";
}

export function saveLocale(locale) {
  try {
    if (locale === "es") {
      localStorage.setItem(LOCALE_KEY, locale);
    }
  } catch {
    /* ignore */
  }
}
