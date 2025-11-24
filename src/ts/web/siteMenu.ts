/**
 * siteMenu.ts - Site navigation controller
 * Handles mobile menu and dynamic learning links
 */

import { checkAuthentication } from './sharedAuth.js';

class NavigationController {
  constructor() {
    this.setupMobileMenu();
    this.setupLearningLinks();
  }

  setupMobileMenu(): void {
    const menuToggle = document.getElementById('mobile-menu-toggle');
    if (menuToggle) {
      menuToggle.onclick = (event) => this.toggleMobileMenu(event);
    }
  }

  toggleMobileMenu(event: Event): void {
    const mobileMenu = document.getElementById('mobile-menu');
    const hamburgerIcon = document.getElementById('hamburger-icon');
    const closeIcon = document.getElementById('close-icon');

    if (mobileMenu && hamburgerIcon && closeIcon) {
      const isHidden = mobileMenu.classList.contains('hidden');
      
      if (isHidden) {
        mobileMenu.classList.remove('hidden');
        hamburgerIcon.classList.add('hidden');
        closeIcon.classList.remove('hidden');
      } else {
        mobileMenu.classList.add('hidden');
        hamburgerIcon.classList.remove('hidden');
        closeIcon.classList.add('hidden');
      }
    }
  }

  setupLearningLinks(): void {
    const isAuthenticated = checkAuthentication();
    
    const text = isAuthenticated ? 'Back to Learning' : 'Start Learning';
    const href = isAuthenticated ? '/learn/' : '/hello/';

    // Update all learning links
    const linkSelectors = ['#desktop-learning-link', '#mobile-learning-link'];
    linkSelectors.forEach((selector) => {
      const link = document.querySelector(selector);
      if (link) {
        link.textContent = text;
        (link as HTMLAnchorElement).href = href;
      }
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new NavigationController();
});