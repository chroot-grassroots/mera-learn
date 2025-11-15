/**
 * solidAuth.ts - Mera Platform OAuth Flow Initiator
 * Starts OAuth login and redirects to provider
 * Callback handling happens on /learn page via meraBridge
 */

import { getDefaultSession } from '@inrupt/solid-client-authn-browser';
import type { Session } from '@inrupt/solid-client-authn-browser';

/**
 * Wait for Solid client libraries to load with timeout
 * @param timeoutMs Maximum time to wait in milliseconds
 * @throws Error if libraries don't load within timeout
 */
async function waitForSolidLibraries(timeoutMs: number = 5000): Promise<void> {
  const startTime = Date.now();
  
  while (!(window as any).solidClientAuthentication) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Solid libraries failed to load within timeout');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Start OAuth flow - redirect user to Solid provider for authentication
 */
async function startOAuthFlow(): Promise<void> {
  console.log('🔗 Mera Solid Auth: Starting OAuth flow...');
  
  try {
    const session: Session = getDefaultSession();
    
    // Get custom provider from URL params if present
    const urlParams = new URLSearchParams(window.location.search);
    const customProvider = urlParams.get('provider');
    const providerUrl = customProvider || 'https://solidcommunity.net';

    console.log('🔗 Using provider:', providerUrl);
    showLoading(`Connecting to ${providerUrl}...`);

    // Start OAuth - user will be redirected to provider
    await session.login({
      oidcIssuer: providerUrl,
      redirectUrl: 'http://127.0.0.1:8000/learn',
      clientName: 'Mera Digital Security Education',
    });
  } catch (error) {
    console.error('❌ OAuth flow failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    showError(`Failed to connect to provider: ${errorMessage}`);
  }
}

/**
 * Initialize authentication when DOM is ready
 */
async function initAuth(): Promise<void> {
  try {
    await waitForSolidLibraries();
    await startOAuthFlow();
  } catch (error) {
    console.error('❌ Authentication initialization failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    showError(`Initialization failed: ${errorMessage}`);
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
});

// UI Helper Functions
function showLoading(message: string): void {
  updateUI('loading', message);
}

function showError(message: string): void {
  updateUI('error', message);
}

function updateUI(state: 'loading' | 'error', message: string): void {
  const loadingSection = document.getElementById('loading-section');
  const errorSection = document.getElementById('error-section');

  [loadingSection, errorSection].forEach((section) => {
    if (section) section.classList.add('hidden');
  });

  if (state === 'loading' && loadingSection) {
    loadingSection.classList.remove('hidden');
    const msgEl = loadingSection.querySelector('.loading-message');
    if (msgEl) msgEl.textContent = message;
  } else if (state === 'error' && errorSection) {
    errorSection.classList.remove('hidden');
    const msgEl = errorSection.querySelector('.error-message');
    if (msgEl) msgEl.textContent = message;
  }

  const statusDiv = document.getElementById('solid-status');
  if (statusDiv) statusDiv.textContent = message;
}