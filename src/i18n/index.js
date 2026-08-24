import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadLocale, saveLocale } from "../lib/locale_prefs";
import es from "./locales/es.json";

const initial = loadLocale();

i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
  },
  lng: initial,
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

if (typeof document !== "undefined") {
  document.documentElement.lang = initial;
}

export default i18n;
