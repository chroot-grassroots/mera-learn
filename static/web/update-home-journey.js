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

// src/ts/web/updateHomeJourney.ts
function updateJourneyButtons() {
  const isAuthenticated = checkAuthentication();
  const unauthenticatedButtons = document.getElementById("unauthenticated-buttons");
  const authenticatedButtons = document.getElementById("authenticated-buttons");
  if (isAuthenticated) {
    if (unauthenticatedButtons) {
      unauthenticatedButtons.classList.add("hidden");
    }
    if (authenticatedButtons) {
      authenticatedButtons.classList.remove("hidden");
    }
  } else {
    if (unauthenticatedButtons) {
      unauthenticatedButtons.classList.remove("hidden");
    }
    if (authenticatedButtons) {
      authenticatedButtons.classList.add("hidden");
    }
  }
}
document.addEventListener("DOMContentLoaded", updateJourneyButtons);
