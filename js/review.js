function renderReview(filter = "") {

  const list = document.getElementById("review-list");

  const empty = document.getElementById("review-empty");

  const detail = document.getElementById("review-detail");

  list.innerHTML = "";

  detail.classList.add("hidden");



  const lang = I18n.getLanguage();

  const reviewIds = Storage.getReviewWords();

  const q = filter.trim().toLowerCase();



  const entries = reviewIds

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

    card.addEventListener("click", () => showReviewDetail(entry));

    list.appendChild(card);

  }

}



function showReviewDetail(entry) {

  const detail = document.getElementById("review-detail");

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

          <button class="btn btn-danger" id="review-remove">
            <span class="material-symbols-outlined" aria-hidden="true">playlist_remove</span>
            <span class="btn-label">${I18n.t("removeFromReview")}</span>
          </button>

        </div>

      </div>

    </div>

  `;



  document.getElementById("review-remove").addEventListener("click", () => {

    Storage.unmarkReview(entry.id);

    detail.classList.add("hidden");

    renderReview(document.getElementById("review-search").value);

  });



  Speech.syncSpeakButtons();
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });

}



function initReview() {

  const input = document.getElementById("review-search");

  let debounce;

  input.addEventListener("input", () => {

    clearTimeout(debounce);

    debounce = setTimeout(() => renderReview(input.value), 200);

  });

}



window.Review = { initReview, renderReview };

