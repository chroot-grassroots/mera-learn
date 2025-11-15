/**
 * solid-auth.js - Mera Platform OAuth Flow Initiator
 * Starts OAuth login and redirects to provider
 * Callback handling happens on /learn page via meraBridge
 */

document.addEventListener("DOMContentLoaded", function () {
  const waitForSolidLibraries = setInterval(() => {
    if (window.solidClientAuthentication) {
      clearInterval(waitForSolidLibraries);
      startOAuthFlow();
    }
  }, 100);
});

async function startOAuthFlow() {
  console.log("🔗 Mera Solid Auth: Starting OAuth flow...");
  
  try {
    const session = window.solidClientAuthentication.getDefaultSession();
    
    // Get custom provider from URL params if present
    const urlParams = new URLSearchParams(window.location.search);
    const customProvider = urlParams.get("provider");
    const providerUrl = customProvider || "https://solidcommunity.net";

    console.log("🔗 Using provider:", providerUrl);
    showLoading(`Connecting to ${providerUrl}...`);

    // Start OAuth - user will be redirected to provider
    await session.login({
      oidcIssuer: providerUrl,
      redirectUrl: "http://127.0.0.1:8000/learn",
      clientName: "Mera Digital Security Education",
      scope: "openid webid",
    });
  } catch (error) {
    console.error("❌ OAuth flow failed:", error);
    showError(`Failed to connect to provider: ${error.message}`);
  }
}

// UI Helper Functions
function showLoading(message) {
  updateUI("loading", message);
}

function showError(message) {
  updateUI("error", message);
}

function updateUI(state, message) {
  const loadingSection = document.getElementById("loading-section");
  const errorSection = document.getElementById("error-section");

  [loadingSection, errorSection].forEach((section) => {
    if (section) section.classList.add("hidden");
  });

  if (state === "loading" && loadingSection) {
    loadingSection.classList.remove("hidden");
    const msgEl = loadingSection.querySelector(".loading-message");
    if (msgEl) msgEl.textContent = message;
  } else if (state === "error" && errorSection) {
    errorSection.classList.remove("hidden");
    const msgEl = errorSection.querySelector(".error-message");
    if (msgEl) msgEl.textContent = message;
  }

  const statusDiv = document.getElementById("solid-status");
  if (statusDiv) statusDiv.textContent = message;
}