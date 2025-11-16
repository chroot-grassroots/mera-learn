/**
 * sharedAuth.ts - Shared authentication utilities
 * Used by siteMenu and updateHomeJourney to check session state
 */

/**
 * Wait for Solid libraries to be available
 */
async function waitForSolidLibraries(timeoutMs: number = 5000): Promise<void> {
  const startTime = Date.now();
  
  while (!(window as any).solidClientAuthentication) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Solid libraries failed to load');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Check if user is authenticated (with session restoration)
 * Call this once per page load, then reuse the result
 */
export async function checkAuthentication(): Promise<boolean> {
  try {
    // Wait for solid-bundle.js to expose globals
    await waitForSolidLibraries();
    
    if (!(window as any).solidClientAuthentication) {
      return false;
    }

    const session = (window as any).solidClientAuthentication.getDefaultSession();
    
    // Restore session if needed (from OAuth callback or localStorage)
    await session.handleIncomingRedirect(window.location.href);
    
    return session.info.isLoggedIn;
  } catch (error) {
    console.log('Auth check failed:', error);
    return false;
  }
}

declare global {
  interface Window {
    solidClientAuthentication: any;
  }
}