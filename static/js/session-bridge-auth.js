
(function() {
    'use strict';
    
    console.log('🔗 Solid Session Bridge initializing...');
    
    // Wait for Solid libraries to be available
    function waitForSolid() {
        return new Promise((resolve) => {
            if (window.solidClientAuthentication) {
                resolve();
                return;
            }
            
            const checkInterval = setInterval(() => {
                if (window.solidClientAuthentication) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }
    
    // Initialize session bridge
    async function initSessionBridge() {
        await waitForSolid();
        
        const session = window.solidClientAuthentication.getDefaultSession();
        
        // Handle any pending OAuth redirects immediately
        try {
            await session.handleIncomingRedirect(window.location.href);
            console.log('🔑 Session bridge: OAuth redirect processed');
        } catch (error) {
            console.warn('Session bridge: No redirect to process');
        }
        
        // Store session info in a way PyScript can access it reliably
        const updateSessionInfo = () => {
            const info = session.info;
            window._solidSessionInfo = {
                isLoggedIn: info ? info.isLoggedIn : false,
                webId: info ? info.webId : null,
                timestamp: Date.now()
            };
            
            // Also store in localStorage for extra persistence
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
        
        // Update session info immediately
        updateSessionInfo();
        
        // Listen for session changes
        session.onSessionRestore(() => {
            console.log('🔄 Session bridge: Session restored');
            updateSessionInfo();
        });
        
        session.onLogin(() => {
            console.log('🔐 Session bridge: User logged in');
            updateSessionInfo();
        });
        
        session.onLogout(() => {
            console.log('🚪 Session bridge: User logged out');
            updateSessionInfo();
        });
        
        console.log('✅ Session bridge ready');
    }
    
    // Start the bridge when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionBridge);
    } else {
        initSessionBridge();
    }
})();