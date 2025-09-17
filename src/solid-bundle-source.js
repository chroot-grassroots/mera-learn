// Bundle the Solid libraries for browser use
import * as solidClient from '@inrupt/solid-client';
import * as solidClientAuth from '@inrupt/solid-client-authn-browser';

// Make libraries available globally for PyScript
window.solidClient = solidClient;
window.solidClientAuthentication = solidClientAuth;

// Create a convenient combined API
window.SolidAPI = {
    client: solidClient,
    auth: solidClientAuth,
    
    // Commonly used functions for easy access
    saveFileInContainer: solidClient.saveFileInContainer,
    getFile: solidClient.getFile,
    getPodUrlAll: solidClient.getPodUrlAll,
    
    // Auth functions
    getDefaultSession: solidClientAuth.getDefaultSession,
    login: solidClientAuth.login,
    logout: solidClientAuth.logout
};

console.log('✅ Solid libraries bundled and ready for TypeScript');
console.log('Available: window.solidClient, window.solidClientAuthentication, window.SolidAPI');