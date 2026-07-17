function closeAllTokenMenus() {
  document.querySelectorAll(".token-menu-btn[aria-expanded='true']").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
    btn.nextElementSibling?.classList.add("hidden");
  });
  if (typeof Sentences?.closeWordPopover === "function") Sentences.closeWordPopover();
}

function updateTokenMenuLabels(tokenItem) {
  const entryId = tokenItem.dataset.entryId;
  if (!entryId) return;

  const knownBtn = tokenItem.querySelector('.token-menu__item[data-action="known"]');
  const reviewBtn = tokenItem.querySelector('.token-menu__item[data-action="review"]');
  if (!knownBtn || !reviewBtn) return;

  const knownLabel = knownBtn.querySelector(".token-menu__label");
  const reviewLabel = reviewBtn.querySelector(".token-menu__label");

  if (Storage.isKnown(entryId)) {
    knownLabel.textContent = I18n.t("markedKnown");
    knownBtn.disabled = true;
    knownBtn.classList.add("token-menu__item--disabled");
  } else {
    knownLabel.textContent = I18n.t("markAsKnown");
    knownBtn.disabled = false;
    knownBtn.classList.remove("token-menu__item--disabled");
  }

  if (Storage.isReview(entryId)) {
    reviewLabel.textContent = I18n.t("removeFromReview");
    reviewBtn.classList.add("token-menu__item--active");
  } else {
    reviewLabel.textContent = I18n.t("addToReview");
    reviewBtn.classList.remove("token-menu__item--active");
  }
}

function navigateToTokenSearch(query) {
  if (!query) return;
  Search.navigateToQuery(query);
}

function handleTokenLookup(tokenItem) {
  const query = tokenItem?.dataset.searchQ;
  if (!query) return;
  closeAllTokenMenus();
  navigateToTokenSearch(query);
}

function toggleTokenMenu(btn) {
  const wasOpen = btn.getAttribute("aria-expanded") === "true";
  closeAllTokenMenus();
  if (wasOpen) return;

  const tokenItem = btn.closest(".token-item");
  if (tokenItem) updateTokenMenuLabels(tokenItem);

  const panel = btn.nextElementSibling;
  panel?.classList.remove("hidden");
  btn.setAttribute("aria-expanded", "true");
}

function handleTokenMenuAction(action, tokenItem) {
  const entryId = tokenItem?.dataset.entryId;
  if (!entryId) return;

  if (action === "lookup") {
    handleTokenLookup(tokenItem);
    return;
  }

  if (action === "known") {
    if (!Storage.isKnown(entryId)) {
      Storage.markKnown(entryId);
      if (typeof window.updateStats === "function") window.updateStats();
    }
    updateTokenMenuLabels(tokenItem);
    closeAllTokenMenus();
    return;
  }

  if (action === "review") {
    if (Storage.isReview(entryId)) {
      Storage.unmarkReview(entryId);
    } else {
      Storage.markReview(entryId);
    }
    if (typeof window.updateStats === "function") window.updateStats();
    updateTokenMenuLabels(tokenItem);
    closeAllTokenMenus();
  }
}

function initTokens() {
  document.addEventListener("click", (e) => {
    const lookupBtn = e.target.closest(".token-lookup-btn");
    if (lookupBtn) {
      e.preventDefault();
      e.stopPropagation();
      handleTokenLookup(lookupBtn.closest(".token-item"));
      return;
    }

    const menuBtn = e.target.closest(".token-menu-btn");
    if (menuBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleTokenMenu(menuBtn);
      return;
    }

    const menuItem = e.target.closest(".token-menu__item");
    if (menuItem && !menuItem.disabled) {
      e.preventDefault();
      e.stopPropagation();
      const tokenItem = menuItem.closest(".token-item");
      handleTokenMenuAction(menuItem.dataset.action, tokenItem);
      return;
    }

    if (!e.target.closest(".token-menu")) {
      closeAllTokenMenus();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllTokenMenus();
  });
}

window.Tokens = { initTokens, closeAllTokenMenus, updateTokenMenuLabels };
