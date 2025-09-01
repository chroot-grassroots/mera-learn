// Simplified session-bridge-auth.js
(function() {
    'use strict';
    
    console.log('🔗 Solid Session Bridge initializing...');
    
    // Initialize session bridge
    async function initSessionBridge() {
        // Wait for Solid to be available
        while (!window.solidClientAuthentication) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const session = window.solidClientAuthentication.getDefaultSession();
        
        // Handle OAuth redirect if present
        try {
            await session.handleIncomingRedirect(window.location.href);
            console.log('🔑 Session bridge: OAuth redirect processed');
        } catch (error) {
            console.warn('Session bridge: No redirect to process or error:', error);
        }
        
        // Simple session info update function
        const updateSessionInfo = () => {
            const info = session.info;
            window._solidSessionInfo = {
                isLoggedIn: info ? info.isLoggedIn : false,
                webId: info ? info.webId : null,
                timestamp: Date.now()
            };
            
            console.log('📋 Session bridge: Updated session info', window._solidSessionInfo);
            
            // Store in localStorage
            if (info && info.isLoggedIn) {
                localStorage.setItem('mera_solid_session', JSON.stringify({
                    webId: info.webId,
                    timestamp: Date.now()
                }));
                console.log('✅ Session bridge: User authenticated -', info.webId);
            } else {
                localStorage.removeItem('mera_solid_session');
                console.log('❌ Session bridge: User not authenticated');
            }
        };
        
        // Update immediately
        updateSessionInfo();
        
        // Update periodically (simpler than event listeners)
        setInterval(updateSessionInfo, 1000);  // Check every second
        
        console.log('✅ Session bridge ready');
    }
    
    // Start when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionBridge);
    } else {
        initSessionBridge();
    }
})();