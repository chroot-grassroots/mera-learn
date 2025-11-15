"use strict";
(() => {
  async function updateJourneyButtons() {
    const unauthenticatedButtons = document.querySelector(
      "#unauthenticated-buttons"
    );
    const authenticatedButtons = document.querySelector(
      "#authenticated-buttons"
    );
    if (!unauthenticatedButtons || !authenticatedButtons) {
      console.log("Journey button elements not found");
      return;
    }
    let isAuthenticated = false;
    try {
      if (window.solidClientAuthentication) {
        const session = window.solidClientAuthentication.getDefaultSession();
        isAuthenticated = session.info.isLoggedIn;
      }
    } catch (error) {
      console.log("Solid authentication check failed:", error);
    }
    if (isAuthenticated) {
      unauthenticatedButtons.classList.add("hidden");
      authenticatedButtons.classList.remove("hidden");
    } else {
      unauthenticatedButtons.classList.remove("hidden");
      authenticatedButtons.classList.add("hidden");
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    updateJourneyButtons();
  });
})();
