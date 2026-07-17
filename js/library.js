function renderLibrary(filter = "") {
  const list = document.getElementById("library-list");
  const empty = document.getElementById("library-empty");
  const detail = document.getElementById("library-detail");
  list.innerHTML = "";
  detail.classList.add("hidden");

  const lang = I18n.getLanguage();
  const knownIds = Storage.getKnownWords();
  const q = filter.trim().toLowerCase();

  const entries = knownIds
    .map((id) => Data.getEntry(id))
    .filter(Boolean)
    .filter((e) => {
      if (!q) return true;
      const tr = Data.getTranslation(e, lang).toLowerCase();
      return e.swedish.toLowerCase().includes(q) || tr.includes(q) || e.lemma.includes(q);
    });

  if (entries.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <div class="result-header">
        <div>
          <div class="result-type">${I18n.typeLabel(entry.type)}</div>
          <div class="result-word">${Data.escapeHtml(entry.swedish)}</div>
          <div class="result-translation">${Data.escapeHtml(Data.getTranslation(entry, lang))}</div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => showLibraryDetail(entry));
    list.appendChild(card);
  }
}

function showLibraryDetail(entry) {
  const detail = document.getElementById("library-detail");
  const lang = I18n.getLanguage();
  const example = entry.examples?.[0];

  let exampleHtml = "";
  if (example) {
    exampleHtml = `
        <strong>${I18n.t("examples")}</strong>
        <div class="example-block">
          ${Data.renderExampleSv(example.swedish)}
          ${example.translations[lang] ? `<div class="example-tr">${Data.escapeHtml(example.translations[lang])}</div>` : ""}
        </div>
        <strong>${I18n.t("sentenceBreakdown")}</strong>
        <div class="token-panel">${Data.renderTokens(example.tokens, lang)}</div>`;
  } else if (entry.usageNote) {
    exampleHtml = `<p class="usage-note"><strong>${I18n.t("usageNote")}:</strong> ${Data.escapeHtml(entry.usageNote)}</p>`;
  }

  detail.classList.remove("hidden");
  detail.innerHTML = `
    <div class="result-card expanded">
      <div class="result-header">
        <div>
          <div class="result-type">${I18n.typeLabel(entry.type)}</div>
          <div class="result-word">${Data.escapeHtml(entry.swedish)}</div>
          <div class="result-translation">${Data.escapeHtml(Data.getTranslation(entry, lang))}</div>
        </div>
      </div>
      <div class="result-detail">
        ${exampleHtml}
        <div class="card-actions">
          <button class="btn btn-danger" id="lib-remove-known">
            <span class="material-symbols-outlined" aria-hidden="true">bookmark_remove</span>
            <span class="btn-label">${I18n.t("removeFromKnown")}</span>
          </button>
          <button class="btn ${Storage.isReview(entry.id) ? "btn-secondary" : "btn-warning"}" id="lib-toggle-review">
            <span class="material-symbols-outlined" aria-hidden="true">replay</span>
            <span class="btn-label">${Storage.isReview(entry.id) ? I18n.t("removeFromReview") : I18n.t("addToReview")}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("lib-remove-known").addEventListener("click", () => {
    Storage.unmarkKnown(entry.id);
    detail.classList.add("hidden");
    renderLibrary(document.getElementById("library-search").value);
  });

  document.getElementById("lib-toggle-review").addEventListener("click", () => {
    const btn = document.getElementById("lib-toggle-review");
    const label = btn.querySelector(".btn-label");
    if (Storage.isReview(entry.id)) {
      Storage.unmarkReview(entry.id);
      label.textContent = I18n.t("addToReview");
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-warning");
    } else {
      Storage.markReview(entry.id);
      label.textContent = I18n.t("removeFromReview");
      btn.classList.remove("btn-warning");
      btn.classList.add("btn-secondary");
    }
  });

  Speech.syncSpeakButtons();
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function initLibrary() {
  const input = document.getElementById("library-search");
  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => renderLibrary(input.value), 200);
  });
}

window.Library = { initLibrary, renderLibrary };
