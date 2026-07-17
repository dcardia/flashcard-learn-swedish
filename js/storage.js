const CONFIG_KEY = "flashcards_config";
const KNOWN_KEY = "flashcards_known";
const REVIEW_KEY = "flashcards_review";
const SENTENCES_KEY = "flashcards_my_sentences";

function getConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function getKnownWords() {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function isKnown(id) {
  return getKnownWords().includes(id);
}

function markKnown(id) {
  const known = getKnownWords();
  if (!known.includes(id)) {
    known.push(id);
    localStorage.setItem(KNOWN_KEY, JSON.stringify(known));
  }
}

function unmarkKnown(id) {
  const known = getKnownWords().filter((k) => k !== id);
  localStorage.setItem(KNOWN_KEY, JSON.stringify(known));
}

function getReviewWords() {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function isReview(id) {
  return getReviewWords().includes(id);
}

function markReview(id) {
  const review = getReviewWords();
  if (!review.includes(id)) {
    review.push(id);
    localStorage.setItem(REVIEW_KEY, JSON.stringify(review));
  }
}

function unmarkReview(id) {
  const review = getReviewWords().filter((k) => k !== id);
  localStorage.setItem(REVIEW_KEY, JSON.stringify(review));
}

function getMySentences() {
  try {
    const raw = localStorage.getItem(SENTENCES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addMySentence(text) {
  const swedish = text.trim();
  if (!swedish) return null;

  const sentences = getMySentences();
  const item = {
    id: `sentence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    swedish,
    createdAt: new Date().toISOString(),
  };
  sentences.unshift(item);
  localStorage.setItem(SENTENCES_KEY, JSON.stringify(sentences));
  return item;
}

function removeMySentence(id) {
  const sentences = getMySentences().filter((s) => s.id !== id);
  localStorage.setItem(SENTENCES_KEY, JSON.stringify(sentences));
}

window.Storage = {
  getConfig,
  saveConfig,
  getKnownWords,
  isKnown,
  markKnown,
  unmarkKnown,
  getReviewWords,
  isReview,
  markReview,
  unmarkReview,
  getMySentences,
  addMySentence,
  removeMySentence,
};
