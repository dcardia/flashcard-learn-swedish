const VALID_VIEWS = ["flashcards", "search", "library", "review", "sentences", "settings"];
const DEFAULT_VIEW = "flashcards";

function getRouteFromHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const queryStart = raw.indexOf("?");
  const viewPart = (queryStart === -1 ? raw : raw.slice(0, queryStart)).toLowerCase();
  const params = new URLSearchParams(queryStart === -1 ? "" : raw.slice(queryStart + 1));
  const view = VALID_VIEWS.includes(viewPart) ? viewPart : DEFAULT_VIEW;
  return { view, params };
}

function getViewFromHash() {
  return getRouteFromHash().view;
}

function setViewHash(view, replace = false) {
  const newHash = `#/${view}`;
  if (location.hash === newHash) return;
  if (replace) {
    history.replaceState(null, "", newHash);
  } else {
    location.hash = newHash;
  }
}

function showView(name, options = {}) {
  const view = VALID_VIEWS.includes(name) ? name : DEFAULT_VIEW;
  const { syncHash = true } = options;

  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("hidden", !v.id.endsWith(view));
    v.classList.toggle("active", v.id.endsWith(view));
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle("active", isActive);
    if (isActive) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  });

  if (syncHash) setViewHash(view);

  if (view === "flashcards") Flashcards.buildDeck();
  if (view === "library") Library.renderLibrary();
  if (view === "review") Review.renderReview();
  if (view === "sentences") Sentences.renderSentences();
  if (view === "search") {
    const q = getRouteFromHash().params.get("q");
    if (q) Search.applyQuery(q);
  }
  updateStats();
}

function updateGreeting() {
  const config = Storage.getConfig();
  const el = document.getElementById("user-greeting");
  if (config?.name) {
    el.textContent = I18n.t("greeting", { name: config.name });
  } else {
    el.textContent = "";
  }
}

function updateStats() {
  document.getElementById("stats-total").textContent = Data.getAllEntries().length;
  document.getElementById("stats-known").textContent = Storage.getKnownWords().length;
  document.getElementById("stats-review").textContent = Storage.getReviewWords().length;
}

function applyConfigToForms(config) {
  document.getElementById("settings-name").value = config.name || "";
  document.getElementById("settings-language").value = config.uiLanguage || "en";
}

function saveConfigFromForm(name, uiLanguage) {
  const config = {
    name: name.trim(),
    uiLanguage,
    onboardingComplete: true,
  };
  Storage.saveConfig(config);
  I18n.setLanguage(uiLanguage);
  updateGreeting();
  updateStats();
}

function showWelcomeIfNeeded() {
  const config = Storage.getConfig();
  if (WelcomeWizard.isOnboardingNeeded()) {
    WelcomeWizard.openWizard();
    return false;
  }
  I18n.setLanguage(config.uiLanguage || "en");
  applyConfigToForms(config);
  updateGreeting();
  return true;
}

function initApp() {
  Data.init();

  document.getElementById("main-nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-btn");
    if (btn) showView(btn.dataset.view);
  });

  window.addEventListener("hashchange", () => {
    showView(getViewFromHash(), { syncHash: false });
  });

  document.getElementById("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("settings-name").value;
    const uiLanguage = document.getElementById("settings-language").value;
    saveConfigFromForm(name, uiLanguage);
  });

  WelcomeWizard.initWelcomeWizard();
  Flashcards.initFlashcards();
  Search.initSearch();
  Tokens.initTokens();
  Library.initLibrary();
  Review.initReview();
  Sentences.initSentences();

  if (showWelcomeIfNeeded()) {
    const initialView = getViewFromHash();
    showView(initialView, { syncHash: false });
    if (!location.hash) {
      setViewHash(initialView, true);
    }
  }

  updateStats();
}

document.addEventListener("DOMContentLoaded", initApp);
window.showView = showView;
window.updateStats = updateStats;
