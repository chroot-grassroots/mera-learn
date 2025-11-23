/**
 * shared-auth.ts - Lightweight auth state checking
 * Uses localStorage timestamp to avoid loading Solid bundle on all pages
 */

const AUTH_TIMESTAMP_KEY = 'mera_last_auth';
const SESSION_TTL_DAYS = 14;

/**
 * Check if user is likely authenticated based on local timestamp
 * Returns true if logged in within last 14 days
 */
export function checkAuthentication(): boolean {
  const lastAuth = localStorage.getItem(AUTH_TIMESTAMP_KEY);
  
  // No timestamp or explicitly logged out
  if (!lastAuth || lastAuth === '0') {
    return false;
  }
  
  // Check if within TTL
  const daysSince = (Date.now() - parseInt(lastAuth)) / (1000 * 60 * 60 * 24);
  return daysSince < SESSION_TTL_DAYS;
}