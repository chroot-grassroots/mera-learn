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

// src/ts/web/updateHomeJourney.ts
async function updateJourneyButtons() {
  const unauthenticatedButtons = document.querySelector("#unauthenticated-buttons");
  const authenticatedButtons = document.querySelector("#authenticated-buttons");
  if (!unauthenticatedButtons || !authenticatedButtons) {
    console.log("Journey button elements not found");
    return;
  }
  const isAuthenticated = await checkAuthentication();
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
