/**
 * updateHomeJourney.ts - Dynamic homepage journey buttons
 * Updates CTA buttons based on authentication state
 */

import { checkAuthentication } from './shared-auth.js';

function updateJourneyButtons(): void {
  const isAuthenticated = checkAuthentication();
  
  const unauthenticatedButtons = document.getElementById('unauthenticated-buttons');
  const authenticatedButtons = document.getElementById('authenticated-buttons');
  
  if (isAuthenticated) {
    // Show authenticated "Continue Your Journey" button
    if (unauthenticatedButtons) {
      unauthenticatedButtons.classList.add('hidden');
    }
    if (authenticatedButtons) {
      authenticatedButtons.classList.remove('hidden');
    }
  } else {
    // Show unauthenticated "New Users / Returning Users" buttons
    if (unauthenticatedButtons) {
      unauthenticatedButtons.classList.remove('hidden');
    }
    if (authenticatedButtons) {
      authenticatedButtons.classList.add('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', updateJourneyButtons);