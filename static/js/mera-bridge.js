/**
 * mera-bridge.js - Storage Bridge for PyScript
 * Uses pre-bundled Solid libraries (window.solidClientAuthentication)
 * Provides the singleton interface between PyScript and Solid Pod storage
 */

class MeraBridge {
    constructor() {
        this.session = null;
        this.podUrl = null;
        this.initialized = false;
        this.initializationPromise = null;
    }

    async initialize() {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this._doInitialize();
        return this.initializationPromise;
    }

    async _doInitialize() {
        console.log('🌉 Mera Bridge initializing...');

        // Wait for Solid libraries to be ready
        if (!window.solidClientAuthentication) {
            console.log('⏳ Waiting for Solid libraries...');
            await this._waitForSolidLibraries();
        }

        try {
            // Get the session
            this.session = window.solidClientAuthentication.getDefaultSession();

            // Try to restore session from localStorage if not active
            if (!this.session.info.isLoggedIn) {
                await this._tryRestoreSession();
            }

            if (this.session.info.isLoggedIn) {
                // Extract pod URL from WebID
                this.podUrl = this._extractPodUrl(this.session.info.webId);
                this.initialized = true;
                console.log('✅ Bridge initialized - Pod:', this.podUrl);
                return true;
            } else {
                console.log('❌ Bridge initialization failed - not authenticated');
                return false;
            }
        } catch (error) {
            console.error('❌ Bridge initialization error:', error);
            return false;
        }
    }

    async _waitForSolidLibraries() {
        return new Promise((resolve) => {
            const checkLibraries = setInterval(() => {
                if (window.solidClientAuthentication) {
                    clearInterval(checkLibraries);
                    resolve();
                }
            }, 100);
        });
    }

    async _tryRestoreSession() {
        try {
            const stored = localStorage.getItem('mera_solid_session');
            if (!stored) return false;

            const sessionData = JSON.parse(stored);
            
            // Check if session is recent (within 24 hours)
            const sessionAge = Date.now() - sessionData.timestamp;
            if (sessionAge > 24 * 60 * 60 * 1000) {
                localStorage.removeItem('mera_solid_session');
                return false;
            }

            // Try to restore the session
            await this.session.handleIncomingRedirect(window.location.href);
            
            return this.session.info.isLoggedIn;
        } catch (error) {
            console.warn('Session restoration failed:', error);
            return false;
        }
    }

    _extractPodUrl(webId) {
        try {
            // WebID format: https://example.solidcommunity.net/profile/card#me
            // Pod URL format: https://example.solidcommunity.net/
            const url = new URL(webId);
            return `${url.protocol}//${url.host}`;
        } catch (error) {
            console.error('Failed to extract pod URL from WebID:', webId, error);
            throw new Error('Invalid WebID format');
        }
    }

    // Contract Methods - Called by PyScript

    async solidLoad(filename) {
        await this.initialize();
        
        if (!this.initialized) {
            return { 
                success: false, 
                data: null, 
                error: 'Bridge not initialized - authentication required',
                errorType: 'authentication'
            };
        }

        try {
            const url = `${this.podUrl}/mera-learn/${filename}`;
            console.log('📥 Loading from Solid Pod:', url);

            const response = await this.session.fetch(url);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Solid load successful:', filename);
                return { success: true, data, error: null };
            } else if (response.status === 404) {
                console.log('📄 File not found in Solid Pod:', filename);
                return { success: false, data: null, error: 'File not found', errorType: 'not_found' };
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('❌ Solid load failed:', filename, error);
            return { 
                success: false, 
                data: null, 
                error: error.message, 
                errorType: 'network' 
            };
        }
    }

    async solidSave(filename, data) {
        await this.initialize();
        
        if (!this.initialized) {
            return { 
                success: false, 
                error: 'Bridge not initialized - authentication required',
                errorType: 'authentication'
            };
        }

        try {
            const url = `${this.podUrl}/mera-learn/${filename}`;
            console.log('💾 Saving to Solid Pod:', url);

            const response = await this.session.fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                console.log('✅ Solid save successful:', filename);
                return { success: true, error: null };
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('❌ Solid save failed:', filename, error);
            return { 
                success: false, 
                error: error.message, 
                errorType: 'network' 
            };
        }
    }

    async localLoad(filename) {
        try {
            const key = `mera_${filename}`;
            const data = localStorage.getItem(key);
            
            if (data) {
                const parsed = JSON.parse(data);
                console.log('📥 Local load successful:', filename);
                return { success: true, data: parsed, error: null };
            } else {
                console.log('📄 File not found in local storage:', filename);
                return { success: false, data: null, error: 'File not found', errorType: 'not_found' };
            }
        } catch (error) {
            console.error('❌ Local load failed:', filename, error);
            return { 
                success: false, 
                data: null, 
                error: error.message, 
                errorType: 'storage' 
            };
        }
    }

    async localSave(filename, data) {
        try {
            const key = `mera_${filename}`;
            localStorage.setItem(key, JSON.stringify(data));
            console.log('💾 Local save successful:', filename);
            return { success: true, error: null };
        } catch (error) {
            console.error('❌ Local save failed:', filename, error);
            return { 
                success: false, 
                error: error.message, 
                errorType: 'storage' 
            };
        }
    }

    async check() {
        await this.initialize();
        return this.initialized && this.session?.info?.isLoggedIn;
    }

    // Utility Methods

    getDebugInfo() {
        return {
            initialized: this.initialized,
            isLoggedIn: this.session?.info?.isLoggedIn || false,
            webId: this.session?.info?.webId || null,
            podUrl: this.podUrl,
            sessionAge: this._getSessionAge()
        };
    }

    _getSessionAge() {
        try {
            const stored = localStorage.getItem('mera_solid_session');
            if (!stored) return null;
            
            const sessionData = JSON.parse(stored);
            return Math.floor((Date.now() - sessionData.timestamp) / 1000); // seconds
        } catch {
            return null;
        }
    }

    // Clear all local data (for logout)
    clearLocalData() {
        const keys = Object.keys(localStorage).filter(key => key.startsWith('mera_'));
        keys.forEach(key => localStorage.removeItem(key));
        console.log('🧹 Local data cleared');
    }
}

// Wait for DOM to be ready, then create singleton
document.addEventListener('DOMContentLoaded', function() {
    // Create and expose the singleton instance
    window.meraBridge = new MeraBridge();
    
    // Also expose the class for debugging
    window.MeraBridge = MeraBridge;
    
    console.log('🌉 Mera Bridge loaded and ready');
});