// src/ts/web/shared-auth.ts
function checkAuthentication() {
  try {
    const currentSessionId = localStorage.getItem("solidClientAuthn:currentSession");
    if (!currentSessionId) {
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error checking authentication:", error);
    return false;
  }
}

// src/ts/web/siteMenu.ts
var NavigationController = class {
  constructor() {
    this.setupMobileMenu();
    this.setupLearningLinks();
  }
  setupMobileMenu() {
    const menuToggle = document.getElementById("mobile-menu-toggle");
    if (menuToggle) {
      menuToggle.onclick = (event) => this.toggleMobileMenu(event);
    }
  }
  toggleMobileMenu(event) {
    const mobileMenu = document.getElementById("mobile-menu");
    const hamburgerIcon = document.getElementById("hamburger-icon");
    const closeIcon = document.getElementById("close-icon");
    if (mobileMenu && hamburgerIcon && closeIcon) {
      const isHidden = mobileMenu.classList.contains("hidden");
      if (isHidden) {
        mobileMenu.classList.remove("hidden");
        hamburgerIcon.classList.add("hidden");
        closeIcon.classList.remove("hidden");
      } else {
        mobileMenu.classList.add("hidden");
        hamburgerIcon.classList.remove("hidden");
        closeIcon.classList.add("hidden");
      }
    }
  }
  setupLearningLinks() {
    const isAuthenticated = checkAuthentication();
    const text = isAuthenticated ? "Back to Learning" : "Start Learning";
    const href = isAuthenticated ? "/learn/" : "/hello/";
    const linkSelectors = ["#desktop-learning-link", "#mobile-learning-link"];
    linkSelectors.forEach((selector) => {
      const link = document.querySelector(selector);
      if (link) {
        link.textContent = text;
        link.href = href;
      }
    });
  }
};
document.addEventListener("DOMContentLoaded", () => {
  new NavigationController();
});
