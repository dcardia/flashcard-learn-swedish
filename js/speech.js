let swedishVoice = null;

function pickSwedishVoice() {
  if (!window.speechSynthesis) return;

  const voices = speechSynthesis.getVoices();
  swedishVoice =
    voices.find((v) => v.lang === "sv-SE") ||
    voices.find((v) => v.lang.startsWith("sv")) ||
    null;
}

function initSpeech() {
  if (!window.speechSynthesis) return;

  pickSwedishVoice();
  speechSynthesis.addEventListener("voiceschanged", () => {
    pickSwedishVoice();
    syncSpeakButtons();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".speak-sentence-btn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    speakSwedish(btn.dataset.speakText);
  });

  syncSpeakButtons();
}

function syncSpeakButtons() {
  const show = canSpeak();
  document.querySelectorAll(".speak-sentence-btn, #fc-speak").forEach((btn) => {
    btn.classList.toggle("hidden", !show);
  });
}

function canSpeak() {
  return Boolean(window.speechSynthesis);
}

function speakSwedish(text) {
  if (!text?.trim() || !canSpeak()) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.lang = "sv-SE";
  utterance.rate = 0.92;
  if (swedishVoice) utterance.voice = swedishVoice;

  speechSynthesis.speak(utterance);
}

window.Speech = { initSpeech, canSpeak, speakSwedish, syncSpeakButtons };
