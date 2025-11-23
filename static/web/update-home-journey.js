// src/ts/web/shared-auth.ts
var AUTH_TIMESTAMP_KEY = "mera_last_auth";
var SESSION_TTL_DAYS = 14;
function checkAuthentication() {
  const lastAuth = localStorage.getItem(AUTH_TIMESTAMP_KEY);
  if (!lastAuth || lastAuth === "0") {
    return false;
  }
  const daysSince = (Date.now() - parseInt(lastAuth)) / (1e3 * 60 * 60 * 24);
  return daysSince < SESSION_TTL_DAYS;
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
