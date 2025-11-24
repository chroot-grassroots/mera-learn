/**
 * shared-auth.ts - Lightweight auth state checking
 * 
 * Queries Solid Client's localStorage keys directly to check auth state
 * without loading the full Solid bundle on every page.
 * 
 * The Solid Client stores session data in localStorage with keys like:
 * - solidClientAuthn:currentSession (stores session ID)
 * - solidClientAuthenticationUser:<sessionId> (stores actual session data)
 */

/**
 * Check if user is authenticated by checking Solid Client's localStorage
 * 
 * We look for the 'solidClientAuthn:currentSession' key which stores the session ID.
 * If this exists, the user has an active Solid session.
 * 
 * @returns true if user has an active Solid session
 */
export function checkAuthentication(): boolean {
  try {
    // Check for Solid Client's currentSession marker
    // NOTE: Key is "solidClientAuthn" not "solidClientAuthenticationUser"
    const currentSessionId = localStorage.getItem('solidClientAuthn:currentSession');
    
    if (!currentSessionId) {
      return false;
    }
    
    // Session ID exists - user is authenticated
    // The actual session validation happens when meraBridge initializes
    return true;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}