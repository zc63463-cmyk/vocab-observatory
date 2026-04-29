"use client";

/**
 * Browser-native TTS for lemma pronunciation.
 * Zero dependencies; silent failure on unsupported browsers.
 */
export function speakLemma(text: string, lang = "en-US") {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  const synth = window.speechSynthesis;

  // Cancel any ongoing utterance to avoid overlapping speech
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
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
