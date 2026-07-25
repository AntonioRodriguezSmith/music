import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadLocale, saveLocale } from "../lib/locale_prefs";
import es from "./locales/es.json";
import en from "./locales/en.json";

const initial = loadLocale();

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = initial;
}

export function setAppLanguage(locale) {
  const next = locale === "en" ? "en" : "es";
  saveLocale(next);
  i18n.changeLanguage(next);
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
}

export default i18n;
