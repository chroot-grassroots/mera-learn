/**
 * solid-auth.js - Mera Platform OAuth Authentication Handler
 * Uses pre-bundled Solid libraries (window.solidClientAuthentication)
 * Replaces complex PyScript authentication with simple JavaScript
 */

// Wait for DOM and Solid libraries to be ready
document.addEventListener("DOMContentLoaded", function () {
  // Wait for bundled libraries
  const waitForSolidLibraries = setInterval(() => {
    if (window.solidClientAuthentication) {
      clearInterval(waitForSolidLibraries);
      initMeraAuth();
    }
  }, 100);
});

async function initMeraAuth() {
  console.log("🔗 Mera Solid Auth initializing...");

  try {
    const session = window.solidClientAuthentication.getDefaultSession();
    const currentUrl = window.location.href;
    const isCallback =
      currentUrl.includes("code=") && currentUrl.includes("state=");

    if (isCallback) {
      await handleAuthCallback(session);
    } else {
      await checkExistingAuthOrStart(session);
    }
  } catch (error) {
    console.error("❌ Auth initialization failed:", error);
    showError(`Authentication failed: ${error.message}`);
  }
}

async function handleAuthCallback(session) {
  console.log("🔄 Processing OAuth callback...");
  showLoading("Processing authentication...");

  try {
    // Handle the OAuth redirect
    await session.handleIncomingRedirect(window.location.href);

    if (session.info.isLoggedIn) {
      console.log("✅ Authentication successful!", session.info.webId);

      // Save session info for the bridge
      saveSessionInfo(session.info);

      // Redirect to learning page
      showSuccess("Authentication successful! Redirecting...");
      setTimeout(() => {
        window.location.href = "/learn";
      }, 1500);
    } else {
      throw new Error(
        "Authentication callback completed but user is not logged in"
      );
    }
  } catch (error) {
    console.error("❌ OAuth callback failed:", error);
    showError(`Authentication failed: ${error.message}`);
  }
}

async function checkExistingAuthOrStart(session) {
  console.log("🔍 Checking existing authentication...");

  // Check if already authenticated
  if (session.info.isLoggedIn) {
    console.log("✅ Already authenticated:", session.info.webId);
    saveSessionInfo(session.info);
    showSuccess("Already authenticated! Redirecting...");
    setTimeout(() => {
      window.location.href = "/learn";
    }, 1000);
    return;
  }

  // Not authenticated - start OAuth flow
  console.log("🔄 Starting OAuth flow...");
  await startOAuthFlow(session);
}

async function startOAuthFlow(session) {
  try {
    // Get custom provider from URL params if present
    const urlParams = new URLSearchParams(window.location.search);
    const customProvider = urlParams.get("provider");
    const providerUrl = customProvider || "https://solidcommunity.net";

    console.log("🔗 Using provider:", providerUrl);
    showLoading(`Connecting to ${providerUrl}...`);

    // Start OAuth login
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

function saveSessionInfo(sessionInfo) {
  const authData = {
    isLoggedIn: sessionInfo.isLoggedIn,
    webId: sessionInfo.webId,
    timestamp: Date.now(),
    sessionId: sessionInfo.sessionId,
  };

  // Save to localStorage for the bridge to read
  localStorage.setItem("mera_solid_session", JSON.stringify(authData));
  console.log("💾 Session info saved for bridge");
}

// UI Helper Functions
function showLoading(message) {
  updateUI("loading", message);
}

function showSuccess(message) {
  updateUI("success", message);
}

function showError(message) {
  updateUI("error", message);
}

function updateUI(state, message) {
  // Update the status elements in the DOM
  const loadingSection = document.getElementById("loading-section");
  const errorSection = document.getElementById("error-section");
  const successSection = document.getElementById("success-section");

  // Hide all sections first
  [loadingSection, errorSection, successSection].forEach((section) => {
    if (section) section.classList.add("hidden");
  });

  // Show appropriate section
  if (state === "loading" && loadingSection) {
    loadingSection.classList.remove("hidden");
    const msgEl = loadingSection.querySelector(".loading-message");
    if (msgEl) msgEl.textContent = message;
  } else if (state === "error" && errorSection) {
    errorSection.classList.remove("hidden");
    const msgEl = errorSection.querySelector(".error-message");
    if (msgEl) msgEl.textContent = message;
  } else if (state === "success" && successSection) {
    successSection.classList.remove("hidden");
    const msgEl = successSection.querySelector(".success-message");
    if (msgEl) msgEl.textContent = message;
  }

  // Also update main status if available
  const statusDiv = document.getElementById("solid-status");
  if (statusDiv) {
    statusDiv.textContent = message;
  }
}
