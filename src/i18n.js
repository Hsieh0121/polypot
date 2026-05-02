// /src/i18n.js

export const LANG_KEY = "polypot_lang";

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

export function getLang() {
  return localStorage.getItem(LANG_KEY) || "zh";
}

export function createTranslator(TEXT) {
  const lang = getLang();

  return function t(key, vars = {}) {
    // 1. 找目前語言
    let str =
      TEXT?.[lang]?.[key] ??
      TEXT?.zh?.[key] ??
      key; // fallback: key 本身

    // 2. template 替換 {xxx}
    if (vars && typeof str === "string") {
      Object.keys(vars).forEach((k) => {
        str = str.replaceAll(`{${k}}`, vars[k]);
      });
    }

    return str;
  };
}