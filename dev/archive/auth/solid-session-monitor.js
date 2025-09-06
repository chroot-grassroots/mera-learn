/**
 * Simplified Solid Session Bridge
 * 
 * This bridge provides read-only session monitoring and creates a global
 * session info object that PyScript can access. It does NOT write to
 * localStorage to avoid conflicts with the Python code.
 * 
 * Professional architecture principles:
 * - Single responsibility: Only monitors session state
 * - No dual management: Python code handles localStorage writing
 * - Consistent naming: Uses same storage key as Python code
 * - Comprehensive logging: Detailed status information
 */
(function() {
    'use strict';
    
    console.log('🔗 Solid Session Bridge initializing...');
    
    // STANDARDIZED STORAGE KEY - Must match the Python code
    const STORAGE_KEY = 'mera_solid_session_backup';
    
    // Global session info object that PyScript can access
    window._solidSessionInfo = {
        isLoggedIn: false,
        webId: null,
        timestamp: null,
        source: 'unknown'
    };
    
    /**
     * Initialize the session bridge with error handling
     */
    async function initSessionBridge() {
        try {
            // Wait for Solid libraries to be available
            console.log('🔄 Session bridge: Waiting for Solid libraries...');
            let attempts = 0;
            const maxAttempts = 100; // 10 seconds maximum wait
            
            while (!window.solidClientAuthentication && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (!window.solidClientAuthentication) {
                console.warn('⚠️ Session bridge: Solid libraries not available after 10 seconds');
                return;
            }
            
            console.log('✅ Session bridge: Solid libraries detected');
            
            const session = window.solidClientAuthentication.getDefaultSession();
            
            // Only handle OAuth redirects on the callback page to avoid conflicts
            const currentPath = window.location.pathname;
            const hasOAuthParams = window.location.search.includes('code=') && window.location.search.includes('state=');
            
            if (currentPath === '/solid/' && hasOAuthParams) {
                console.log('🔑 Session bridge: OAuth callback detected, processing redirect...');
                try {
                    await session.handleIncomingRedirect(window.location.href);
                    console.log('✅ Session bridge: OAuth redirect processed successfully');
                } catch (redirectError) {
                    console.warn('⚠️ Session bridge: Redirect processing failed:', redirectError);
                }
            } else {
                console.log('🔍 Session bridge: Not an OAuth callback, skipping redirect handling');
            }
            
            /**
             * Update global session info object (read-only monitoring)
             */
            function updateSessionInfo() {
                try {
                    const info = session.info;
                    const currentTime = Date.now();
                    
                    if (info && info.isLoggedIn && info.webId) {
                        // Valid active session
                        window._solidSessionInfo = {
                            isLoggedIn: true,
                            webId: info.webId,
                            timestamp: currentTime,
                            source: 'solid_session'
                        };
                        
                        console.log('✅ Session bridge: Active session -', info.webId);
                    } else {
                        // No active session, check localStorage backup (read-only)
                        try {
                            const storedSession = localStorage.getItem(STORAGE_KEY);
                            if (storedSession) {
                                const parsed = JSON.parse(storedSession);
                                const age = currentTime - parsed.timestamp;
                                const maxAge = 60 * 60 * 1000; // 1 hour
                                
                                if (age < maxAge && age >= 0 && parsed.webId && parsed.isLoggedIn) {
                                    // Valid backup session
                                    window._solidSessionInfo = {
                                        isLoggedIn: true,
                                        webId: parsed.webId,
                                        timestamp: parsed.timestamp,
                                        source: 'localStorage_backup'
                                    };
                                    
                                    console.log('📋 Session bridge: Using localStorage backup -', parsed.webId, `(${Math.round(age/1000)}s old)`);
                                } else {
                                    // Expired or invalid backup
                                    window._solidSessionInfo = {
                                        isLoggedIn: false,
                                        webId: null,
                                        timestamp: currentTime,
                                        source: 'expired_backup'
                                    };
                                    
                                    if (age >= maxAge) {
                                        console.log('📋 Session bridge: localStorage backup too old, ignoring');
                                    } else if (age < 0) {
                                        console.log('📋 Session bridge: localStorage backup from future, ignoring');
                                    } else {
                                        console.log('📋 Session bridge: localStorage backup invalid, ignoring');
                                    }
                                }
                            } else {
                                // No backup available
                                window._solidSessionInfo = {
                                    isLoggedIn: false,
                                    webId: null,
                                    timestamp: currentTime,
                                    source: 'no_backup'
                                };
                                
                                console.log('❌ Session bridge: No session or backup available');
                            }
                        } catch (storageError) {
                            console.warn('⚠️ Session bridge: localStorage check failed:', storageError);
                            window._solidSessionInfo = {
                                isLoggedIn: false,
                                webId: null,
                                timestamp: currentTime,
                                source: 'storage_error'
                            };
                        }
                    }
                    
                } catch (updateError) {
                    console.warn('⚠️ Session bridge: Update failed:', updateError);
                    window._solidSessionInfo = {
                        isLoggedIn: false,
                        webId: null,
                        timestamp: Date.now(),
                        source: 'update_error'
                    };
                }
            }
            
            // Update immediately
            updateSessionInfo();
            
            // Monitor session changes periodically (lightweight polling)
            // This is simpler and more reliable than trying to listen to events
            setInterval(updateSessionInfo, 2000); // Check every 2 seconds
            
            console.log('✅ Session bridge ready and monitoring');
            
        } catch (initError) {
            console.error('❌ Session bridge initialization failed:', initError);
        }
    }
    
    /**
     * Utility function for debugging - available in browser console
     */
    window.debugSolidSession = function() {
        console.log('=== Solid Session Debug Info ===');
        console.log('Bridge session info:', window._solidSessionInfo);
        
        if (window.solidClientAuthentication) {
            const session = window.solidClientAuthentication.getDefaultSession();
            console.log('Direct Solid session info:', session?.info);
        }
        
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const age = Date.now() - parsed.timestamp;
                console.log('localStorage backup:', parsed);
                console.log('Backup age (seconds):', Math.round(age / 1000));
                console.log('Backup valid (< 1 hour):', age < 60 * 60 * 1000);
            } catch (e) {
                console.log('localStorage backup (unparseable):', stored);
            }
        } else {
            console.log('localStorage backup: none');
        }
        console.log('===============================');
    };
    
    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionBridge);
    } else {
        initSessionBridge();
    }
    
})();