// src/ts/web/shared-auth.ts
async function waitForSolidLibraries(timeoutMs = 5e3) {
  const startTime = Date.now();
  while (!window.solidClientAuthentication) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Solid libraries failed to load");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
async function checkAuthentication() {
  try {
    await waitForSolidLibraries();
    if (!window.solidClientAuthentication) {
      return false;
    }
    const session = window.solidClientAuthentication.getDefaultSession();
    await session.handleIncomingRedirect(window.location.href);
    return session.info.isLoggedIn;
  } catch (error) {
    console.log("Auth check failed:", error);
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
  async setupLearningLinks() {
    try {
      const isAuthenticated = await checkAuthentication();
      const text = isAuthenticated ? "Back to Learning" : "Start Learning";
      const href = isAuthenticated ? "/learn/" : "/hello/";
      const linkSelectors = ['a[href*="learn"]', "#mobile-learning-link"];
      linkSelectors.forEach((selector) => {
        const link = document.querySelector(selector);
        if (link) {
          link.textContent = text;
          link.href = href;
        }
      });
    } catch (error) {
      console.log("Learning links setup failed:", error);
    }
  }
};
document.addEventListener("DOMContentLoaded", () => {
  new NavigationController();
});
