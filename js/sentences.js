let activeWordEl = null;

function ensureWordPopover() {
  let popover = document.getElementById("word-popover");
  if (popover) return popover;

  popover = document.createElement("div");
  popover.id = "word-popover";
  popover.className = "word-popover hidden";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.innerHTML = `
    <div class="word-popover__header">
      <span class="word-popover__sv"></span>
      <button type="button" class="word-popover__close" aria-label="Close">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>
    <div class="word-popover__translation"></div>
    <div class="word-popover__type"></div>
    <div class="word-popover__actions">
      <button type="button" class="word-popover__action" data-action="lookup">
        <span class="material-symbols-outlined" aria-hidden="true">menu_book</span>
        <span data-i18n="tokenViewEntry">View word entry</span>
      </button>
      <button type="button" class="word-popover__action" data-action="known">
        <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        <span class="word-popover__label" data-i18n="markAsKnown">Mark as known</span>
      </button>
      <button type="button" class="word-popover__action" data-action="review">
        <span class="material-symbols-outlined" aria-hidden="true">replay</span>
        <span class="word-popover__label" data-i18n="addToReview">Add to review</span>
      </button>
    </div>
  `;
  document.body.appendChild(popover);
  return popover;
}

function closeWordPopover() {
  const popover = document.getElementById("word-popover");
  if (!popover) return;
  popover.classList.add("hidden");
  activeWordEl?.classList.remove("sentence-word--active");
  activeWordEl = null;
}

function updateWordPopoverActions(entryId) {
  const popover = document.getElementById("word-popover");
  if (!popover || !entryId) return;

  const knownBtn = popover.querySelector('[data-action="known"]');
  const reviewBtn = popover.querySelector('[data-action="review"]');
  const knownLabel = knownBtn.querySelector(".word-popover__label");
  const reviewLabel = reviewBtn.querySelector(".word-popover__label");

  if (Storage.isKnown(entryId)) {
    knownLabel.textContent = I18n.t("markedKnown");
    knownBtn.disabled = true;
    knownBtn.classList.add("word-popover__action--disabled");
  } else {
    knownLabel.textContent = I18n.t("markAsKnown");
    knownBtn.disabled = false;
    knownBtn.classList.remove("word-popover__action--disabled");
  }

  if (Storage.isReview(entryId)) {
    reviewLabel.textContent = I18n.t("removeFromReview");
    reviewBtn.classList.add("word-popover__action--active");
  } else {
    reviewLabel.textContent = I18n.t("addToReview");
    reviewBtn.classList.remove("word-popover__action--active");
  }
}

function positionWordPopover(popover, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const margin = 8;
  popover.classList.remove("hidden");

  const popRect = popover.getBoundingClientRect();
  let top = rect.bottom + margin + window.scrollY;
  let left = rect.left + rect.width / 2 - popRect.width / 2 + window.scrollX;

  const maxLeft = window.scrollX + document.documentElement.clientWidth - popRect.width - margin;
  left = Math.max(window.scrollX + margin, Math.min(left, maxLeft));

  if (rect.bottom + popRect.height + margin > window.innerHeight) {
    top = rect.top + window.scrollY - popRect.height - margin;
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function openWordPopover(wordEl) {
  if (typeof Tokens?.closeAllTokenMenus === "function") Tokens.closeAllTokenMenus();

  const popover = ensureWordPopover();
  const entryId = wordEl.dataset.entryId;
  const entry = Data.getEntry(entryId);
  if (!entry) return;

  if (activeWordEl && activeWordEl !== wordEl) {
    activeWordEl.classList.remove("sentence-word--active");
  }

  activeWordEl = wordEl;
  wordEl.classList.add("sentence-word--active");

  const lang = I18n.getLanguage();
  popover.dataset.entryId = entryId;
  popover.dataset.searchQ = wordEl.dataset.searchQ || "";
  popover.querySelector(".word-popover__sv").textContent = wordEl.dataset.surface || wordEl.textContent;
  popover.querySelector(".word-popover__translation").textContent =
    wordEl.dataset.translation || Data.getTranslation(entry, lang);
  popover.querySelector(".word-popover__type").textContent = I18n.typeLabel(entry.type);

  updateWordPopoverActions(entryId);
  positionWordPopover(popover, wordEl);
}

function renderFluidSentence(sentence, lang) {
  const tokens = Data.buildSentenceTokens(sentence, lang);
  return tokens
    .map((token) => {
      const text = Data.escapeHtml(token.swedish);
      if (!token.inVocabulary) {
        return `<span class="sentence-word sentence-word--plain">${text}</span>`;
      }

      return `<button
        type="button"
        class="sentence-word sentence-word--known"
        data-entry-id="${Data.escapeHtml(token.entryId)}"
        data-search-q="${Data.escapeHtml(token.searchQ)}"
        data-surface="${Data.escapeAttr(token.swedish)}"
        data-translation="${Data.escapeAttr(token.translation)}"
        aria-haspopup="dialog"
      >${text}</button>`;
    })
    .join(" ");
}

function renderSentenceCard(item) {
  const lang = I18n.getLanguage();
  const card = document.createElement("article");
  card.className = "my-sentence-card";
  card.dataset.id = item.id;

  const hiddenClass =
    window.Speech?.canSpeak && !window.Speech.canSpeak() ? " hidden" : "";

  card.innerHTML = `
    <div class="my-sentence-card__toolbar">
      <button
        type="button"
        class="speak-btn speak-btn--sm speak-sentence-btn${hiddenClass}"
        data-speak-text="${Data.escapeAttr(item.swedish)}"
        aria-label="${Data.escapeAttr(I18n.t("speakSentence"))}"
      >
        <span class="material-symbols-outlined" aria-hidden="true">volume_up</span>
      </button>
      <button type="button" class="btn btn-danger btn-sm my-sentence-delete" aria-label="${Data.escapeAttr(I18n.t("sentencesDelete"))}">
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        <span class="btn-label">${I18n.t("sentencesDelete")}</span>
      </button>
    </div>
    <p class="my-sentence-fluid">${renderFluidSentence(item.swedish, lang)}</p>
  `;

  card.querySelector(".my-sentence-delete").addEventListener("click", () => {
    Storage.removeMySentence(item.id);
    closeWordPopover();
    renderSentences();
  });

  return card;
}

function renderSentences() {
  const list = document.getElementById("sentences-list");
  const empty = document.getElementById("sentences-empty");
  const sentences = Storage.getMySentences();

  list.innerHTML = "";

  if (!sentences.length) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  for (const item of sentences) {
    list.appendChild(renderSentenceCard(item));
  }

  Speech.syncSpeakButtons();
}

function handleWordPopoverAction(action) {
  const popover = document.getElementById("word-popover");
  if (!popover) return;

  const entryId = popover.dataset.entryId;
  const searchQ = popover.dataset.searchQ;

  if (action === "lookup") {
    closeWordPopover();
    if (typeof Tokens?.closeAllTokenMenus === "function") Tokens.closeAllTokenMenus();
    Search.navigateToQuery(searchQ);
    return;
  }

  if (action === "known" && entryId && !Storage.isKnown(entryId)) {
    Storage.markKnown(entryId);
    if (typeof window.updateStats === "function") window.updateStats();
    updateWordPopoverActions(entryId);
    return;
  }

  if (action === "review" && entryId) {
    if (Storage.isReview(entryId)) {
      Storage.unmarkReview(entryId);
    } else {
      Storage.markReview(entryId);
    }
    if (typeof window.updateStats === "function") window.updateStats();
    updateWordPopoverActions(entryId);
  }
}

function initSentences() {
  ensureWordPopover();

  const form = document.getElementById("sentences-form");
  const input = document.getElementById("sentences-input");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const added = Storage.addMySentence(input.value);
    if (!added) return;
    input.value = "";
    renderSentences();
  });

  document.getElementById("sentences-list").addEventListener("click", (e) => {
    const knownWord = e.target.closest(".sentence-word--known");
    if (knownWord) {
      e.preventDefault();
      e.stopPropagation();
      if (activeWordEl === knownWord && !document.getElementById("word-popover")?.classList.contains("hidden")) {
        closeWordPopover();
      } else {
        openWordPopover(knownWord);
      }
      return;
    }

    if (!e.target.closest("#word-popover")) {
      closeWordPopover();
    }
  });

  document.getElementById("word-popover")?.addEventListener("click", (e) => {
    const closeBtn = e.target.closest(".word-popover__close");
    if (closeBtn) {
      e.preventDefault();
      closeWordPopover();
      return;
    }

    const actionBtn = e.target.closest(".word-popover__action");
    if (actionBtn && !actionBtn.disabled) {
      e.preventDefault();
      handleWordPopoverAction(actionBtn.dataset.action);
    }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".sentence-word--known") || e.target.closest("#word-popover")) {
      return;
    }
    closeWordPopover();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeWordPopover();
  });

  window.addEventListener(
    "resize",
    () => {
      if (activeWordEl && !document.getElementById("word-popover")?.classList.contains("hidden")) {
        positionWordPopover(document.getElementById("word-popover"), activeWordEl);
      }
    },
    { passive: true }
  );
}

window.Sentences = { initSentences, renderSentences, closeWordPopover };
