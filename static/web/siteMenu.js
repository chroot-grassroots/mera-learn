"use strict";
(() => {
  class NavigationController {
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
      try {
        if (window.solidClientAuthentication) {
          const session = window.solidClientAuthentication.getDefaultSession();
          const text = session.info.isLoggedIn ? "Back to Learning" : "Start Learning";
          const href = session.info.isLoggedIn ? "/learn/" : "/hello/";
          const linkSelectors = ["a[href*='learn']", "#mobile-learning-link"];
          linkSelectors.forEach((selector) => {
            const link = document.querySelector(selector);
            if (link) {
              link.textContent = text;
              link.href = href;
            }
          });
        }
      } catch (error) {
        console.log("Learning links setup failed:", error);
      }
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    new NavigationController();
  });
})();
