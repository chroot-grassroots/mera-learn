// Update journey buttons based on Solid Pod authentication status

declare global {
  interface Window {
    solidClientAuthentication: any; // or proper type if you know it
  }
}

export {};

async function updateJourneyButtons(): Promise<void> {
  const unauthenticatedButtons = document.querySelector(
    "#unauthenticated-buttons"
  ) as HTMLElement;
  const authenticatedButtons = document.querySelector(
    "#authenticated-buttons"
  ) as HTMLElement;

  if (!unauthenticatedButtons || !authenticatedButtons) {
    console.log("Journey button elements not found");
    return;
  }

  // Check if user has active Solid session
  let isAuthenticated = false;

  try {
    // Access your existing Solid authentication system
    if (window.solidClientAuthentication) {
      const session = window.solidClientAuthentication.getDefaultSession();
      isAuthenticated = session.info.isLoggedIn;
    }
  } catch (error) {
    console.log("Solid authentication check failed:", error);
    // Fallback to unauthenticated state
  }

  if (isAuthenticated) {
    // Show continue button, hide start buttons
    unauthenticatedButtons.classList.add("hidden");
    authenticatedButtons.classList.remove("hidden");
  } else {
    // Show start buttons, hide continue button
    unauthenticatedButtons.classList.remove("hidden");
    authenticatedButtons.classList.add("hidden");
  }
}

// Run on page load
document.addEventListener("DOMContentLoaded", () => {
  updateJourneyButtons();
});
