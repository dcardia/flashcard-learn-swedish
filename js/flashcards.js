let deck = [];

let currentIndex = 0;



function getSelectedCefrLevels() {
  return [...document.querySelectorAll(".flashcards-cefr-level:checked")].map(
    (el) => el.value
  );
}

function getSelectedWordTypes() {
  return [...document.querySelectorAll(".flashcards-word-type:checked")].map(
    (el) => el.value
  );
}

function readFiltersFromDom() {
  return {
    unknownOnly: document.getElementById("flashcards-unknown-only").checked,
    reviewOnly: document.getElementById("flashcards-review-only").checked,
    prioritizeReview: document.getElementById("flashcards-prioritize-review")
      .checked,
    mostCommonOnly: document.getElementById("flashcards-most-common-only")
      .checked,
    cefrLevels: getSelectedCefrLevels(),
    wordTypes: getSelectedWordTypes(),
  };
}

function setCheckbox(id, value) {
  const el = document.getElementById(id);
  if (!el || typeof value !== "boolean") return;
  el.checked = value;
}

function applyFiltersToDom(filters) {
  if (!filters || typeof filters !== "object") return;

  setCheckbox("flashcards-unknown-only", filters.unknownOnly);
  setCheckbox("flashcards-review-only", filters.reviewOnly);
  setCheckbox("flashcards-prioritize-review", filters.prioritizeReview);
  setCheckbox("flashcards-most-common-only", filters.mostCommonOnly);

  if (Array.isArray(filters.cefrLevels)) {
    document.querySelectorAll(".flashcards-cefr-level").forEach((el) => {
      el.checked = filters.cefrLevels.includes(el.value);
    });
  }

  if (Array.isArray(filters.wordTypes)) {
    document.querySelectorAll(".flashcards-word-type").forEach((el) => {
      el.checked = filters.wordTypes.includes(el.value);
    });
  }
}

function persistFilters() {
  Storage.saveFlashcardFilters(readFiltersFromDom());
}

function updateTypeFilterLabels() {
  document.querySelectorAll(".flashcards-type-label").forEach((el) => {
    el.textContent = I18n.typeLabel(el.dataset.type);
  });
}

function initCheckboxFilterDropdown({
  filterEl,
  triggerEl,
  panelEl,
  badgeEl,
  checkboxSelector,
  onSelectionChange,
}) {
  if (!filterEl || !triggerEl || !panelEl) return;

  const updateUi = () => {
    const count = document.querySelectorAll(`${checkboxSelector}:checked`).length;
    filterEl.classList.toggle("filter-dropdown--active", count > 0);
    if (!badgeEl) return;
    if (count > 0) {
      badgeEl.textContent = `(${count})`;
      badgeEl.classList.remove("hidden");
    } else {
      badgeEl.textContent = "";
      badgeEl.classList.add("hidden");
    }
  };

  const closePanel = () => {
    panelEl.classList.add("hidden");
    filterEl.classList.remove("filter-dropdown--open");
    triggerEl.setAttribute("aria-expanded", "false");
  };

  const openPanel = () => {
    panelEl.classList.remove("hidden");
    filterEl.classList.add("filter-dropdown--open");
    triggerEl.setAttribute("aria-expanded", "true");
  };

  triggerEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panelEl.classList.contains("hidden")) openPanel();
    else closePanel();
  });

  document.addEventListener("click", (e) => {
    if (!filterEl.contains(e.target)) closePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panelEl.classList.contains("hidden")) {
      closePanel();
      triggerEl.focus();
    }
  });

  document.querySelectorAll(checkboxSelector).forEach((el) => {
    el.addEventListener("change", () => {
      updateUi();
      onSelectionChange();
    });
  });

  updateUi();
}

function initCefrFilterDropdown() {
  initCheckboxFilterDropdown({
    filterEl: document.getElementById("flashcards-cefr-filter"),
    triggerEl: document.getElementById("flashcards-cefr-trigger"),
    panelEl: document.getElementById("flashcards-cefr-panel"),
    badgeEl: document.getElementById("flashcards-cefr-badge"),
    checkboxSelector: ".flashcards-cefr-level",
    onSelectionChange: buildDeck,
  });
}

function initTypeFilterDropdown() {
  updateTypeFilterLabels();
  initCheckboxFilterDropdown({
    filterEl: document.getElementById("flashcards-type-filter"),
    triggerEl: document.getElementById("flashcards-type-trigger"),
    panelEl: document.getElementById("flashcards-type-panel"),
    badgeEl: document.getElementById("flashcards-type-badge"),
    checkboxSelector: ".flashcards-word-type",
    onSelectionChange: buildDeck,
  });
}

function applyContentFilters(all) {
  const mostCommonOnly = document.getElementById(
    "flashcards-most-common-only"
  ).checked;
  const cefrLevels = getSelectedCefrLevels();
  const wordTypes = getSelectedWordTypes();

  if (mostCommonOnly) all = all.filter((e) => e.mostCommon);
  if (cefrLevels.length) {
    all = all.filter((e) => e.cefr && cefrLevels.includes(e.cefr));
  }
  if (wordTypes.length) {
    all = all.filter((e) => e.type && wordTypes.includes(e.type));
  }

  return all;
}

function buildDeck() {
  persistFilters();

  const unknownOnly = document.getElementById("flashcards-unknown-only").checked;

  const reviewOnly = document.getElementById("flashcards-review-only").checked;

  const prioritizeReview = document.getElementById("flashcards-prioritize-review").checked;



  let all = applyContentFilters(Data.getAllEntries());

  if (unknownOnly) all = all.filter((e) => !Storage.isKnown(e.id));

  if (reviewOnly) all = all.filter((e) => Storage.isReview(e.id));



  if (prioritizeReview && !reviewOnly) {

    const reviewIds = new Set(Storage.getReviewWords());

    const review = all.filter((e) => reviewIds.has(e.id));

    const rest = all.filter((e) => !reviewIds.has(e.id));

    shuffle(review);

    shuffle(rest);

    deck = [...review, ...rest];

  } else {

    deck = [...all];

    if (deck.length > 1) shuffle(deck);

  }



  currentIndex = 0;

  updateCounter();

  renderCard();

}



function shuffle(arr) {

  for (let i = arr.length - 1; i > 0; i--) {

    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];

  }

}



function updateCounter() {

  const el = document.getElementById("flashcards-counter");

  const empty = document.getElementById("flashcards-empty");

  const emptyReview = document.getElementById("flashcards-empty-review");

  const container = document.getElementById("flashcard-container");

  const reviewOnly = document.getElementById("flashcards-review-only").checked;



  if (deck.length === 0) {

    el.textContent = "";

    container.classList.add("hidden");

    if (reviewOnly) {

      empty.classList.add("hidden");

      emptyReview.classList.remove("hidden");

    } else {

      emptyReview.classList.add("hidden");

      empty.classList.remove("hidden");

    }

    return;

  }



  empty.classList.add("hidden");

  emptyReview.classList.add("hidden");

  container.classList.remove("hidden");

  el.textContent = I18n.t("flashcardsCounter", {
    current: currentIndex + 1,
    total: deck.length,
  });

}



function getCurrentEntry() {

  return deck[currentIndex];

}



function renderFlashcardExample(ex, lang) {
  const tenseLabel = ex.tenseLabel ? ex.tenseLabel[lang] : "";
  return `
    <div class="fc-examples-slide">
      <div class="example-block example-block--pending-reveal">
        ${tenseLabel ? `<div class="example-tense">${Data.escapeHtml(tenseLabel)}</div>` : ""}
        ${Data.renderExampleSv(ex.swedish)}
        ${ex.translations[lang] ? `<div class="example-tr">${Data.escapeHtml(ex.translations[lang])}</div>` : ""}
        <div class="token-panel" style="margin-top:0.5rem;">
          ${Data.renderTokens(ex.tokens, lang)}
        </div>
      </div>
    </div>
  `;
}

function syncExamplesCarousel(examplesEl) {
  if (!examplesEl) return;
  const track = examplesEl.querySelector(".fc-examples-track");
  const dots = examplesEl.querySelectorAll(".fc-examples-dot");
  if (!track || !dots.length) return;

  const updateDots = () => {
    const slideWidth = track.clientWidth || 1;
    const index = Math.round(track.scrollLeft / slideWidth);
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
      dot.setAttribute("aria-current", i === index ? "true" : "false");
    });
  };

  track.addEventListener("scroll", updateDots, { passive: true });
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const index = Number(dot.dataset.index) || 0;
      track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    });
  });
  updateDots();
}

function renderExamplesCarousel(examples, lang) {
  const slides = examples.map((ex) => renderFlashcardExample(ex, lang)).join("");
  const dots =
    examples.length > 1
      ? `<div class="fc-examples-dots" role="tablist" aria-label="Examples">
          ${examples
            .map(
              (_, i) =>
                `<button type="button" class="fc-examples-dot${i === 0 ? " is-active" : ""}" data-index="${i}" aria-label="Example ${i + 1}" ${i === 0 ? 'aria-current="true"' : ""}></button>`
            )
            .join("")}
        </div>`
      : "";

  return `
    <div class="fc-examples-track">
      ${slides}
    </div>
    ${dots}
  `;
}

function updateReviewButton(btn, id) {
  const label = btn.querySelector(".btn-label");
  if (Storage.isReview(id)) {
    label.textContent = I18n.t("removeFromReview");
    btn.classList.remove("btn-warning");
    btn.classList.add("btn-secondary");
  } else {
    label.textContent = I18n.t("addToReview");
    btn.classList.remove("btn-secondary");
    btn.classList.add("btn-warning");
  }
}

function renderCard() {

  const entry = getCurrentEntry();

  if (!entry) {

    updateCounter();

    return;

  }



  const lang = I18n.getLanguage();

  const examples = entry.examples || [];

  const hasSentence = examples.length > 0;



  document.getElementById("fc-type").textContent = I18n.typeLabel(entry.type);

  const cefrEl = document.getElementById("fc-cefr");
  if (entry.cefr) {
    cefrEl.textContent = entry.cefr;
    cefrEl.classList.remove("hidden");
  } else {
    cefrEl.textContent = "";
    cefrEl.classList.add("hidden");
  }

  document.getElementById("fc-word").textContent = entry.swedish;

  Speech.syncSpeakButtons();



  document.getElementById("fc-sentence-block").classList.add("hidden");

  document.getElementById("fc-details").classList.add("hidden");



  const showSentenceBtn = document.getElementById("fc-show-sentence");

  const revealBtn = document.getElementById("fc-reveal");

  const examplesEl = document.getElementById("fc-examples");



  if (hasSentence) {

    examplesEl.innerHTML = renderExamplesCarousel(examples, lang);
    examplesEl.classList.toggle("fc-examples--multi", examples.length > 1);
    const track = examplesEl.querySelector(".fc-examples-track");
    if (track) track.scrollLeft = 0;
    syncExamplesCarousel(examplesEl);

    Speech.syncSpeakButtons();

    const showLabel = showSentenceBtn.querySelector(".btn-label");
    showLabel.textContent =
      examples.length > 1 ? I18n.t("showSentences") : I18n.t("showSentence");

    showSentenceBtn.classList.remove("hidden");

    revealBtn.classList.add("hidden");

  } else {

    examplesEl.innerHTML = "";
    examplesEl.classList.remove("fc-examples--multi");

    showSentenceBtn.classList.add("hidden");

    revealBtn.classList.remove("hidden");

  }



  document.getElementById("fc-translation").textContent = Data.getTranslation(entry, lang);



  const usageEl = document.getElementById("fc-usage-note");



  if (entry.usageNote) {

    usageEl.textContent = entry.usageNote;

    usageEl.classList.add("hidden");

  } else {

    usageEl.textContent = "";

    usageEl.classList.add("hidden");

  }



  const knownBtn = document.getElementById("fc-known");
  const knownLabel = knownBtn.querySelector(".btn-label");
  if (Storage.isKnown(entry.id)) {
    knownLabel.textContent = I18n.t("markedKnown");
    knownBtn.disabled = true;
  } else {
    knownLabel.textContent = I18n.t("markKnown");
    knownBtn.disabled = false;
  }



  updateReviewButton(document.getElementById("fc-review"), entry.id);



  updateCounter();

}



function showSentence() {

  document.getElementById("fc-sentence-block").classList.remove("hidden");

  document.getElementById("fc-show-sentence").classList.add("hidden");

  document.getElementById("fc-reveal").classList.remove("hidden");

}



function revealDetails() {

  const entry = getCurrentEntry();

  document.getElementById("fc-details").classList.remove("hidden");

  document.getElementById("fc-reveal").classList.add("hidden");

  document
    .querySelectorAll("#fc-examples .example-block")
    .forEach((block) => block.classList.remove("example-block--pending-reveal"));



  const usageEl = document.getElementById("fc-usage-note");

  if (entry?.usageNote) {

    usageEl.textContent = `${I18n.t("usageNote")}: ${entry.usageNote}`;

    usageEl.classList.remove("hidden");

  }

}



function nextCard() {

  if (deck.length === 0) return;

  currentIndex = (currentIndex + 1) % deck.length;

  renderCard();

}



function prevCard() {

  if (deck.length === 0) return;

  currentIndex = (currentIndex - 1 + deck.length) % deck.length;

  renderCard();

}



function markCurrentKnown() {

  const entry = getCurrentEntry();

  if (!entry || Storage.isKnown(entry.id)) return;

  Storage.markKnown(entry.id);

  const btn = document.getElementById("fc-known");
  btn.querySelector(".btn-label").textContent = I18n.t("markedKnown");
  btn.disabled = true;



  const unknownOnly = document.getElementById("flashcards-unknown-only").checked;

  if (unknownOnly) {

    deck = deck.filter((e) => e.id !== entry.id);

    if (currentIndex >= deck.length) currentIndex = 0;

    renderCard();

  }

}



function toggleCurrentReview() {

  const entry = getCurrentEntry();

  if (!entry) return;



  const reviewOnly = document.getElementById("flashcards-review-only").checked;

  const btn = document.getElementById("fc-review");



  if (Storage.isReview(entry.id)) {

    Storage.unmarkReview(entry.id);

    if (reviewOnly) {

      deck = deck.filter((e) => e.id !== entry.id);

      if (currentIndex >= deck.length) currentIndex = 0;

      renderCard();

      return;

    }

  } else {

    Storage.markReview(entry.id);

  }



  updateReviewButton(btn, entry.id);

}



function speakCurrentWord() {
  const entry = getCurrentEntry();
  if (!entry) return;
  Speech.speakSwedish(entry.swedish);
}



function initMobileFiltersCollapse() {
  const shell = document.getElementById("flashcards-filters-shell");
  const toggle = document.getElementById("flashcards-filters-toggle");
  if (!shell || !toggle) return;

  toggle.addEventListener("click", () => {
    const open = shell.classList.toggle("flashcards-filters-shell--open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function initFlashcards() {

  Speech.initSpeech();

  document.getElementById("fc-speak").addEventListener("click", speakCurrentWord);

  document.getElementById("fc-show-sentence").addEventListener("click", showSentence);

  document.getElementById("fc-reveal").addEventListener("click", revealDetails);

  document.getElementById("fc-next").addEventListener("click", nextCard);

  document.getElementById("fc-prev").addEventListener("click", prevCard);

  document.getElementById("fc-known").addEventListener("click", markCurrentKnown);

  document.getElementById("fc-review").addEventListener("click", toggleCurrentReview);

  document.getElementById("flashcards-unknown-only").addEventListener("change", buildDeck);

  document.getElementById("flashcards-review-only").addEventListener("change", buildDeck);

  document.getElementById("flashcards-prioritize-review").addEventListener("change", buildDeck);

  document.getElementById("flashcards-most-common-only").addEventListener("change", buildDeck);

  const originalApplyI18n = I18n.applyI18n.bind(I18n);
  I18n.applyI18n = function () {
    originalApplyI18n();
    updateTypeFilterLabels();
  };

  initMobileFiltersCollapse();
  applyFiltersToDom(Storage.getFlashcardFilters());
  initCefrFilterDropdown();
  initTypeFilterDropdown();

}



window.Flashcards = { initFlashcards, buildDeck };

