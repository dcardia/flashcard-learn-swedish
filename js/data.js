let entries = [];
let entryById = {};
let formIndex = {};

function init() {
  const data = window.VOCABULARY_DATA;
  if (!data) return;
  entries = data.entries;
  formIndex = data.formIndex || {};
  entryById = {};
  for (const e of entries) entryById[e.id] = e;
}

function getAllEntries() {
  return entries;
}

function getEntry(id) {
  return entryById[id];
}

function getFormIndex() {
  return formIndex;
}

function getTranslation(entry, lang) {
  return entry.translations[lang] || entry.translations.en;
}

function findEntriesByForm(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matchedIds = new Set();

  if (formIndex[q]) {
    formIndex[q].forEach((id) => matchedIds.add(id));
  }

  for (const entry of entries) {
    if (entry.swedish.toLowerCase().includes(q)) matchedIds.add(entry.id);
    if (entry.lemma.includes(q)) matchedIds.add(entry.id);
    const trEn = entry.translations.en?.toLowerCase() || "";
    const trPt = entry.translations.pt?.toLowerCase() || "";
    if (trEn.includes(q) || trPt.includes(q)) matchedIds.add(entry.id);
  }

  return [...matchedIds].map((id) => entryById[id]).filter(Boolean);
}

function findSentencesWithForm(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const entryIds = new Set();
  if (formIndex[q]) formIndex[q].forEach((id) => entryIds.add(id));

  for (const entry of entries) {
    if (entry.forms.some((f) => f.includes(q))) entryIds.add(entry.id);
  }

  const results = [];
  for (const id of entryIds) {
    const entry = entryById[id];
    if (!entry) continue;
    for (const ex of entry.examples) {
      const tokens = ex.tokens.map((t) => normalizeToken(t.swedish));
      const forms = entry.forms.map((f) => f.toLowerCase());
      const matches =
        tokens.some((t) => t === q || forms.includes(t)) ||
        ex.swedish.toLowerCase().includes(q);
      if (matches) {
        results.push({ entry, example: ex });
      }
    }
  }
  return results;
}

function normalizeToken(token) {
  return token.toLowerCase().replace(/[.!?,?;:…"'”’)\]}]+$/, "").trim();
}

function findEntryIdsByToken(swedish) {
  const key = normalizeToken(swedish);
  if (!key || !formIndex[key]) return [];
  return formIndex[key].map((id) => entryById[id]).filter(Boolean);
}

function findEntryByToken(swedish) {
  const matches = findEntryIdsByToken(swedish);
  return matches[0] || null;
}

function generateSingularCandidates(word) {
  const key = word.trim().toLowerCase().normalize("NFC");
  const candidates = [];
  const add = (candidate) => {
    if (!candidate || candidate.length < 2 || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  add(key);

  if (key.startsWith("i") && key.length > 2 && !key.includes(" ")) {
    add(`i ${key.slice(1)}`);
  }
  if (key.endsWith("la") && key.length > 3) {
    const stem = key.slice(0, -2);
    add(stem + "el");
    add(stem + "al");
    add(stem + "mal");
  }
  if (key.endsWith("ra") && key.length > 3) {
    add(key.slice(0, -2) + "er");
  }
  if (key.endsWith("a") && key.length > 3) {
    add(key.slice(0, -1));
    add(key.slice(0, -1) + "e");
  }
  if (key.endsWith("arna")) {
    add(key.slice(0, -4) + "e");
    add(key.slice(0, -4));
  }
  if (key.endsWith("orna")) {
    add(key.slice(0, -4) + "a");
  }
  if (key.endsWith("na") && key.length > 4) {
    add(key.slice(0, -2));
  }
  if (key.endsWith("en") && key.length > 3) {
    add(key.slice(0, -2));
    add(key.slice(0, -1));
  }
  if (key.endsWith("n") && key.length > 3 && !key.endsWith("en") && !key.endsWith("nn")) {
    add(key.slice(0, -1));
  }
  if (key.endsWith("ar") && key.length > 3) {
    add(key.slice(0, -2));
    add(key.slice(0, -2) + "e");
  }
  if (key.endsWith("er") && key.length > 3) {
    add(key.slice(0, -2));
    add(key.slice(0, -1));
  }

  return candidates;
}

function findEntryByTokenWithFallback(swedish) {
  for (const candidate of generateSingularCandidates(swedish)) {
    const entry = findEntryByToken(candidate);
    if (entry) return entry;
  }
  return null;
}

function tokenizeSentence(sentence) {
  return sentence
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^["'(]+|["')]+$/g, ""))
    .filter(Boolean);
}

function shortGloss(text, lang) {
  if (!text || text === "—") return null;
  let gloss = text.split("/")[0].trim();
  if (lang === "en") gloss = gloss.replace(/^to\s+/i, "");
  if (lang === "pt") gloss = gloss.toLowerCase();
  return gloss || null;
}

function buildSentenceTokens(sentence, lang) {
  return tokenizeSentence(sentence).map((swedish) => {
    const entry = findEntryByTokenWithFallback(swedish);
    const translation = entry ? shortGloss(getTranslation(entry, lang), lang) : null;
    return {
      swedish,
      entry,
      entryId: entry?.id || null,
      translation,
      searchQ: getTokenSearchQuery(swedish),
      inVocabulary: Boolean(entry && translation),
    };
  });
}

function getTokenSearchQuery(swedish) {
  return normalizeToken(swedish);
}

function hasTokenTranslation(tok, lang) {
  const tr = tok.translations?.[lang] || tok.translations?.en;
  return Boolean(tr && tr !== "—" && String(tr).trim());
}

function isTokenInVocabulary(swedish) {
  return findEntryIdsByToken(swedish).length > 0;
}

function renderTokenItem(tok, lang) {
  const translation = tok.translations[lang] || tok.translations?.en || "—";
  const entry = findEntryByToken(tok.swedish);
  const linked = entry && hasTokenTranslation(tok, lang);
  const searchQ = getTokenSearchQuery(tok.swedish);

  if (!linked) {
    return `
    <div class="token-item">
      <span class="token-sv">${escapeHtml(tok.swedish)}</span>
      <span class="token-tr">${escapeHtml(translation)}</span>
    </div>`;
  }

  return `
    <div class="token-item token-item--linked" data-entry-id="${escapeHtml(entry.id)}" data-search-q="${escapeHtml(searchQ)}">
      <div class="token-item__main">
        <span class="token-sv">${escapeHtml(tok.swedish)}</span>
        <span class="token-tr">${escapeHtml(translation)}</span>
      </div>
      <div class="token-item__actions">
        <button type="button" class="token-action-btn token-lookup-btn" data-i18n-aria="tokenLookupAria" aria-label="${escapeHtml(I18n.t("tokenLookupAria"))}">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
        </button>
        <div class="token-menu">
          <button type="button" class="token-action-btn token-menu-btn" data-i18n-aria="tokenMenuAria" aria-label="${escapeHtml(I18n.t("tokenMenuAria"))}" aria-expanded="false" aria-haspopup="true">
            <span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>
          </button>
          <div class="token-menu__panel hidden" role="menu">
            <button type="button" class="token-menu__item" role="menuitem" data-action="lookup">
              <span class="material-symbols-outlined" aria-hidden="true">menu_book</span>
              <span data-i18n="tokenViewEntry">View word entry</span>
            </button>
            <button type="button" class="token-menu__item" role="menuitem" data-action="known">
              <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
              <span class="token-menu__label" data-i18n="markAsKnown">Mark as known</span>
            </button>
            <button type="button" class="token-menu__item" role="menuitem" data-action="review">
              <span class="material-symbols-outlined" aria-hidden="true">replay</span>
              <span class="token-menu__label" data-i18n="addToReview">Add to review</span>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderTokens(tokens, lang) {
  return tokens.map((tok) => renderTokenItem(tok, lang)).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

function renderExampleSv(swedish) {
  if (!swedish?.trim()) return "";
  const hiddenClass =
    window.Speech?.canSpeak && !window.Speech.canSpeak() ? " hidden" : "";
  return `
    <div class="example-sv-row">
      <div class="example-sv">${escapeHtml(swedish)}</div>
      <button
        type="button"
        class="speak-btn speak-btn--sm speak-sentence-btn${hiddenClass}"
        data-speak-text="${escapeAttr(swedish)}"
        aria-label="${escapeAttr(I18n.t("speakSentence"))}"
      >
        <span class="material-symbols-outlined" aria-hidden="true">volume_up</span>
      </button>
    </div>`;
}

window.Data = {
  init,
  getAllEntries,
  getEntry,
  getFormIndex,
  getTranslation,
  findEntriesByForm,
  findSentencesWithForm,
  findEntryByToken,
  findEntryByTokenWithFallback,
  findEntryIdsByToken,
  buildSentenceTokens,
  tokenizeSentence,
  shortGloss,
  getTokenSearchQuery,
  hasTokenTranslation,
  isTokenInVocabulary,
  normalizeToken,
  renderExampleSv,
  renderTokens,
  escapeHtml,
  escapeAttr,
};
