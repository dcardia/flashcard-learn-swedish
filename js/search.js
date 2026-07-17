function renderSearchResults(query) {
  const container = document.getElementById("search-results");
  const empty = document.getElementById("search-empty");
  container.innerHTML = "";

  if (!query.trim()) {
    empty.classList.add("hidden");
    return;
  }

  const lang = I18n.getLanguage();
  const entries = Data.findEntriesByForm(query);
  const sentenceHits = Data.findSentencesWithForm(query);

  if (entries.length === 0 && sentenceHits.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const shown = new Set();

  for (const entry of entries) {
    if (shown.has(entry.id)) continue;
    shown.add(entry.id);
    container.appendChild(buildEntryCard(entry, lang, query));
  }

  for (const { entry, example } of sentenceHits) {
    if (shown.has(entry.id)) continue;
    shown.add(entry.id);
    container.appendChild(buildEntryCard(entry, lang, query, example));
  }

  Speech.syncSpeakButtons();
}

function buildEntryCard(entry, lang, query, highlightExample) {
  const card = document.createElement("div");
  card.className = "result-card";
  card.dataset.id = entry.id;

  const formsPreview = entry.forms.slice(0, 8).join(", ");
  const moreForms = entry.forms.length > 8 ? "…" : "";

  card.innerHTML = `
    <div class="result-header">
      <div>
        <div class="result-type">${I18n.typeLabel(entry.type)}</div>
        <div class="result-word">${Data.escapeHtml(entry.swedish)}</div>
        <div class="result-translation">${Data.escapeHtml(Data.getTranslation(entry, lang))}</div>
        <div class="result-forms">${I18n.t("forms")}: ${Data.escapeHtml(formsPreview)}${moreForms}</div>
        ${entry.cefr ? `<div class="result-forms">CEFR: ${Data.escapeHtml(entry.cefr)}</div>` : ""}
      </div>
    </div>
    <div class="result-detail">
      <strong>${I18n.t("examples")}</strong>
      ${entry.examples.map((ex) => renderExample(ex, lang, highlightExample?.id === ex.id)).join("")}
      ${entry.usageNote ? `<p class="usage-note"><strong>${I18n.t("usageNote")}:</strong> ${Data.escapeHtml(entry.usageNote)}</p>` : ""}
      <div class="card-actions">
        <button class="btn btn-success btn-mark-known" data-id="${entry.id}"${Storage.isKnown(entry.id) ? " disabled" : ""}>
          <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <span class="btn-label">${Storage.isKnown(entry.id) ? I18n.t("markedKnown") : I18n.t("markAsKnown")}</span>
        </button>
        <button class="btn ${Storage.isReview(entry.id) ? "btn-secondary" : "btn-warning"} btn-mark-review" data-id="${entry.id}">
          <span class="material-symbols-outlined" aria-hidden="true">replay</span>
          <span class="btn-label">${Storage.isReview(entry.id) ? I18n.t("removeFromReview") : I18n.t("addToReview")}</span>
        </button>
      </div>
    </div>
  `;

  card.querySelector(".btn-mark-known")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const id = btn.dataset.id;
    if (Storage.isKnown(id)) return;
    Storage.markKnown(id);
    btn.querySelector(".btn-label").textContent = I18n.t("markedKnown");
    btn.disabled = true;
  });

  card.querySelector(".btn-mark-review")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const id = btn.dataset.id;
    const label = btn.querySelector(".btn-label");
    if (Storage.isReview(id)) {
      Storage.unmarkReview(id);
      label.textContent = I18n.t("addToReview");
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-warning");
    } else {
      Storage.markReview(id);
      label.textContent = I18n.t("removeFromReview");
      btn.classList.remove("btn-warning");
      btn.classList.add("btn-secondary");
    }
  });

  return card;
}

function renderExample(ex, lang, highlight) {
  const tenseLabel = ex.tenseLabel ? ex.tenseLabel[lang] : "";
  const style = highlight ? ' style="background:var(--accent-light);padding:0.5rem;border-radius:8px;border:1px solid var(--accent-muted);"' : "";
  return `
    <div class="example-block"${style}>
      ${tenseLabel ? `<div class="example-tense">${Data.escapeHtml(tenseLabel)}</div>` : ""}
      ${Data.renderExampleSv(ex.swedish)}
      ${ex.translations[lang] ? `<div class="example-tr">${Data.escapeHtml(ex.translations[lang])}</div>` : ""}
      <div class="token-panel" style="margin-top:0.5rem;">
        ${Data.renderTokens(ex.tokens, lang)}
      </div>
    </div>
  `;
}

function applyQuery(query) {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.value = query;
  renderSearchResults(query);
}

function navigateToQuery(query) {
  if (!query) return;
  const targetHash = `#/search?q=${encodeURIComponent(query)}`;
  if (location.hash === targetHash) {
    if (typeof window.showView === "function") {
      window.showView("search", { syncHash: false });
    } else {
      applyQuery(query);
    }
    return;
  }
  location.hash = targetHash;
}

function initSearch() {
  const input = document.getElementById("search-input");
  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderSearchResults(input.value), 200);
  });
}

window.Search = { initSearch, renderSearchResults, applyQuery, navigateToQuery };
