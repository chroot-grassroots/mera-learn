/**
 * updateHomeJourney.ts - Dynamic journey button behavior
 * Shows appropriate buttons based on authentication state
 */

import { checkAuthentication } from './shared-auth.js';

async function updateJourneyButtons(): Promise<void> {
  const unauthenticatedButtons = document.querySelector('#unauthenticated-buttons');
  const authenticatedButtons = document.querySelector('#authenticated-buttons');

  if (!unauthenticatedButtons || !authenticatedButtons) {
    console.log('Journey button elements not found');
    return;
  }

  // Check authentication (includes session restoration)
  const isAuthenticated = await checkAuthentication();

  if (isAuthenticated) {
    unauthenticatedButtons.classList.add('hidden');
    authenticatedButtons.classList.remove('hidden');
  } else {
    unauthenticatedButtons.classList.remove('hidden');
    authenticatedButtons.classList.add('hidden');
  }
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  updateJourneyButtons();
});