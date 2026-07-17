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
  setNavOpen(false);

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

function setNavOpen(open) {
  const toggle = document.getElementById("nav-menu-toggle");
  const backdrop = document.getElementById("nav-backdrop");
  document.body.classList.toggle("nav-open", open);
  if (toggle) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", I18n.t(open ? "navMenuClose" : "navMenuOpen"));
  }
  if (backdrop) backdrop.hidden = !open;
}

function syncNavMount(isMobile) {
  const nav = document.getElementById("main-nav");
  const backdrop = document.getElementById("nav-backdrop");
  const topbarInner = document.querySelector(".app-topbar-inner");
  if (!nav || !backdrop || !topbarInner) return;

  if (isMobile) {
    // Portal overlays to <body> so position:fixed isn't trapped by the sticky topbar
    document.body.appendChild(backdrop);
    document.body.appendChild(nav);
  } else {
    topbarInner.appendChild(nav);
    if (backdrop.parentElement !== document.body) {
      document.body.appendChild(backdrop);
    }
    setNavOpen(false);
  }
}

function initMobileNav() {
  const toggle = document.getElementById("nav-menu-toggle");
  const closeBtn = document.getElementById("nav-menu-close");
  const backdrop = document.getElementById("nav-backdrop");
  const mobileQuery = window.matchMedia("(max-width: 639px)");

  const applyMount = () => syncNavMount(mobileQuery.matches);
  applyMount();
  mobileQuery.addEventListener("change", applyMount);

  toggle?.addEventListener("click", () => {
    setNavOpen(!document.body.classList.contains("nav-open"));
  });
  closeBtn?.addEventListener("click", () => setNavOpen(false));
  backdrop?.addEventListener("click", () => setNavOpen(false));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
      setNavOpen(false);
      toggle?.focus();
    }
  });
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
  initMobileNav();

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
