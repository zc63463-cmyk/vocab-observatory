"use client";

/**
 * Map common short language codes to BCP-47 tags the browser's TTS expects.
 * E.g. 'en' (stored in DB) → 'en-US' for broader voice support.
 */
const LANG_MAP: Record<string, string> = {
  en: "en-US",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  it: "it-IT",
  ru: "ru-RU",
  pt: "pt-BR",
};

function resolveTtsLang(lang: string): string {
  return LANG_MAP[lang.toLowerCase()] ?? lang;
}

/**
 * Browser-native TTS for lemma pronunciation.
 * Zero dependencies; silent failure on unsupported browsers.
 */
export function speakLemma(text: string, lang?: string) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  const synth = window.speechSynthesis;

  // Cancel any ongoing utterance to avoid overlapping speech
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang ? resolveTtsLang(lang) : "en-US";
  utter.rate = 0.95;
  utter.pitch = 1.0;

  synth.speak(utter);
}

/**
 * Returns whether the current browser supports speech synthesis.
 * Useful for conditional UI (e.g. hiding the speaker icon).
 */
export function canSpeak(): boolean {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window;
}
