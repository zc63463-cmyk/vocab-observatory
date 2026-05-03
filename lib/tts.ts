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
 * Per-language voice preference. Patterns are matched against
 * SpeechSynthesisVoice.name in order — the first match that also matches
 * the target language wins. The top of each list targets Chrome's cloud
 * "Google …" voices which sound identical whether the user is on
 * desktop Chrome or Chrome on Android → gives us cross-device parity
 * without shipping our own TTS engine. Subsequent entries are local OS
 * fallbacks for the case where Google voices aren't installed.
 */
const VOICE_PREFERENCES: Record<string, readonly RegExp[]> = {
  "en-US": [
    /^Google US English$/i,
    /^Microsoft Aria/i,
    /^Microsoft Zira/i,
    /^Samantha/i,
    /^Daniel/i,
  ],
  "en-GB": [
    /^Google UK English Female$/i,
    /^Google UK English Male$/i,
    /^Microsoft Libby/i,
    /^Daniel/i,
  ],
  "zh-CN": [
    /^Google 普通话/i,
    /^Google.*Mandarin/i,
    /^Microsoft Xiaoxiao/i,
    /^Tingting/i,
  ],
  "ja-JP": [/^Google.*日本語/i, /^Kyoko/i, /^Microsoft Nanami/i],
  "ko-KR": [/^Google.*한국어/i, /^Yuna/i],
  "de-DE": [/^Google Deutsch/i, /^Anna/i, /^Microsoft Katja/i],
  "fr-FR": [/^Google français/i, /^Thomas/i, /^Microsoft Denise/i],
  "es-ES": [/^Google español/i, /^Monica/i, /^Microsoft Helena/i],
  "it-IT": [/^Google italiano/i, /^Alice/i, /^Microsoft Elsa/i],
  "ru-RU": [/^Google русский/i, /^Milena/i],
  "pt-BR": [/^Google português do Brasil/i, /^Luciana/i],
};

/**
 * `speechSynthesis.getVoices()` is notoriously async-populated: on first
 * call after page load it often returns []. The `voiceschanged` event
 * fires once the list is ready. We prime a cache here and keep it up
 * to date so pickVoice() can be synchronous at the point-of-use.
 */
let cachedVoices: SpeechSynthesisVoice[] | null = null;

function getCachedVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  if (cachedVoices && cachedVoices.length > 0) return cachedVoices;
  const list = window.speechSynthesis.getVoices();
  if (list.length > 0) {
    cachedVoices = list;
  }
  return list;
}

/** Returns the best voice for the target BCP-47 tag, or null if none
 *  match. Falls back progressively: preferred-name match → same-tag →
 *  same-language-prefix → any voice. */
function pickVoice(targetLang: string): SpeechSynthesisVoice | null {
  const voices = getCachedVoices();
  if (voices.length === 0) return null;

  const tagLower = targetLang.toLowerCase();
  const prefix = tagLower.split("-")[0];
  const preferences = VOICE_PREFERENCES[targetLang] ?? [];

  // 1. Preferred voice names that also match the language tag.
  for (const pattern of preferences) {
    const match = voices.find(
      (v) =>
        pattern.test(v.name) &&
        v.lang.toLowerCase().startsWith(prefix),
    );
    if (match) return match;
  }

  // 2. Exact language-tag match (e.g. "en-US" === "en-US").
  const exact = voices.find((v) => v.lang.toLowerCase() === tagLower);
  if (exact) return exact;

  // 3. Language-prefix match (e.g. any "en-*").
  const prefixMatch = voices.find((v) =>
    v.lang.toLowerCase().startsWith(prefix),
  );
  return prefixMatch ?? null;
}

// Warm up the voice list at module load on the client. Chrome fires
// `voiceschanged` once the async population completes; Safari + Firefox
// usually populate synchronously so the initial `getCachedVoices()` call
// already fills the cache. We listen regardless to handle both.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  getCachedVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    cachedVoices = window.speechSynthesis.getVoices();
  });
}

/**
 * Browser-native TTS for lemma pronunciation.
 * Zero dependencies; silent failure on unsupported browsers.
 *
 * Voice selection: we explicitly pick a preferred voice (see
 * VOICE_PREFERENCES) so the same word sounds identical on desktop
 * Chrome and Chrome on Android as long as a Google cloud voice is
 * available on both — which it is by default on Chrome.
 */
export function speakLemma(text: string, lang?: string) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  const synth = window.speechSynthesis;

  // Cancel any ongoing utterance to avoid overlapping speech
  synth.cancel();

  const targetLang = lang ? resolveTtsLang(lang) : "en-US";
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = targetLang;
  utter.rate = 0.95;
  utter.pitch = 1.0;

  // Assigning .voice only when we actually found a match — leaving it
  // null would force the browser to its locale default, which on
  // Android is often a lower-quality on-device voice.
  const voice = pickVoice(targetLang);
  if (voice) {
    utter.voice = voice;
    // Some engines require `utter.lang` to match `voice.lang` exactly;
    // override in case pickVoice returned a voice with a compatible
    // prefix but different region (e.g. "en-GB" selected for "en-US").
    utter.lang = voice.lang;
  }

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
