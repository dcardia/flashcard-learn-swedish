let currentStep = 0;
let selectedLanguage = "en";

function showStep(step) {
  currentStep = step;
  document.querySelectorAll(".wizard-step").forEach((el) => {
    const isActive = Number(el.dataset.step) === step;
    el.classList.toggle("hidden", !isActive);
    el.classList.toggle("active", isActive);
  });
  document.querySelectorAll(".wizard-dot").forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.step) <= step);
  });
}

function completeWizard(name) {
  const config = {
    name: name.trim(),
    uiLanguage: selectedLanguage,
    onboardingComplete: true,
  };
  Storage.saveConfig(config);
  I18n.setLanguage(selectedLanguage);
  document.getElementById("welcome-wizard").classList.add("hidden");
  document.getElementById("settings-name").value = config.name;
  document.getElementById("settings-language").value = config.uiLanguage;
  updateGreeting();
  updateStats();
  Flashcards.buildDeck();
}

function isOnboardingNeeded() {
  const config = Storage.getConfig();
  return !config?.onboardingComplete && !config?.name;
}

function openWizard() {
  currentStep = 0;
  selectedLanguage = "en";
  document.querySelectorAll(".wizard-lang-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.lang === selectedLanguage);
  });
  document.getElementById("wizard-name").value = "";
  showStep(0);
  document.getElementById("welcome-wizard").classList.remove("hidden");
  document.getElementById("wizard-next-0").focus();
}

function initWelcomeWizard() {
  document.getElementById("wizard-next-0").addEventListener("click", () => {
    showStep(1);
    document.getElementById("wizard-lang-en").focus();
  });

  document.getElementById("wizard-back-1").addEventListener("click", () => {
    showStep(0);
    document.getElementById("wizard-next-0").focus();
  });

  document.getElementById("wizard-back-2").addEventListener("click", () => {
    showStep(1);
    const selected = document.querySelector(
      `.wizard-lang-btn[data-lang="${selectedLanguage}"]`
    );
    if (selected) selected.focus();
  });

  document.querySelectorAll(".wizard-lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedLanguage = btn.dataset.lang;
      document.querySelectorAll(".wizard-lang-btn").forEach((b) => {
        b.classList.toggle("selected", b.dataset.lang === selectedLanguage);
      });
      I18n.setLanguage(selectedLanguage);
      showStep(2);
      document.getElementById("wizard-name").focus();
    });
  });

  document.getElementById("wizard-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("wizard-name").value;
    if (!name.trim()) return;
    completeWizard(name);
  });
}

window.WelcomeWizard = {
  initWelcomeWizard,
  isOnboardingNeeded,
  openWizard,
};
