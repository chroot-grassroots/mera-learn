(function () {
    'use strict';

    console.log('🔗 Solid Session Bridge initializing...');

    // Initialize session bridge

    async function initSessionBridge() {
        // Wait for Solid to be available
        while (!window.solidClientAuthentication) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('🔄 Session bridge: Solid libraries detected');

        const session = window.solidClientAuthentication.getDefaultSession();

        // Only handle redirects if we're on the OAuth callback page
        const currentPath = window.location.pathname;
        if (currentPath === '/solid/' && window.location.search.includes('code=')) {
            // Only handle redirects on the OAuth callback page
            await session.handleIncomingRedirect(window.location.href);
            console.log('🔑 Session bridge: OAuth redirect processed');
        } else {
            console.log('🔍 Session bridge: Not a callback, skipping redirect handling');
        }

        // Rest of your updateSessionInfo code...
    }


    // Start when ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionBridge);
    } else {
        initSessionBridge();
    }
})();