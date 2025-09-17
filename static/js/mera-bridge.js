/**
 * mera-bridge.js - Storage Bridge for TypeScript
 * Uses pre-bundled Solid libraries (window.solidClientAuthentication)
 * Provides the singleton interface between TypeScript and Solid Pod storage
 * 
 * FIXES:
 * - Proper session restoration with session ID mismatch handling
 * - Automatic redirect to authentication when needed
 * - Better error handling and logging
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

            // Try to restore session if not active
            if (!this.session.info.isLoggedIn) {
                const restored = await this._tryRestoreSession();
                if (restored) {
                    // ✅ Use stored data directly when restoration succeeds
                    const stored = localStorage.getItem('mera_solid_session');
                    const sessionData = JSON.parse(stored);

                    console.log('✅ Using restored session data');
                    console.log('✅ WebID from storage:', sessionData.webId);
                    this.podUrl = this._extractPodUrl(sessionData.webId);
                    this.initialized = true;
                    return true;
                } else {
                    // Instead of failing, redirect to authentication
                    console.log('🔄 Authentication required, will redirect...');
                    this._scheduleAuthRedirect();
                    return false;
                }
            }

            // ADD THIS MISSING PART:
            // Continue with normal flow for active sessions
            if (this.session.info.isLoggedIn) {
                // Extract pod URL from WebID
                this.podUrl = this._extractPodUrl(this.session.info.webId);
                this.initialized = true;
                console.log('✅ Bridge initialized - Pod:', this.podUrl);
                console.log('✅ WebID:', this.session.info.webId);
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
            console.log('🔄 Attempting session restoration...');

            // First, let Solid handle its own session restoration
            await this.session.handleIncomingRedirect(window.location.href);

            // If that worked, we're done
            if (this.session.info.isLoggedIn) {
                console.log('✅ Session restored via handleIncomingRedirect');
                this._updateLocalStorage();
                return true;
            }

            // Check if we have valid localStorage data
            const stored = localStorage.getItem('mera_solid_session');
            if (!stored) {
                console.log('📭 No stored session data found');
                return false;
            }

            const sessionData = JSON.parse(stored);
            console.log('📋 Found stored session data:', sessionData);

            // Check if session is recent (within 24 hours)
            const sessionAge = Date.now() - sessionData.timestamp;
            if (sessionAge > 24 * 60 * 60 * 1000) {
                localStorage.removeItem('mera_solid_session');
                console.log('⏰ Stored session expired, removed');
                return false;
            }

            // Check for session ID mismatch
            const currentSessionId = this.session.info.sessionId;
            const storedSessionId = sessionData.sessionId;

            if (currentSessionId !== storedSessionId) {
                console.log('🆔 Session ID mismatch detected:');
                console.log('  Current:', currentSessionId);
                console.log('  Stored:', storedSessionId);

                // Accept authentication if stored session was valid and recent
                if (sessionData.isLoggedIn && sessionData.webId) {
                    console.log('✅ Accepting stored authentication despite session ID mismatch');
                    console.log('📝 WebID from storage:', sessionData.webId);
                    return true; // We'll use stored data in _doInitialize()
                }

                console.log('🔄 Re-authentication required');
                return false;
            }

            // If we get here, the session data looks valid but Solid isn't recognizing it
            console.log('⚠️ Valid session data found but Solid session not active');
            console.log('✅ Accepting stored session data');
            return true;

        } catch (error) {
            console.warn('❌ Session restoration failed:', error);
            return false;
        }
    }

    _scheduleAuthRedirect() {
        // Don't redirect immediately - give PyScript a chance to show error UI
        setTimeout(() => {
            console.log('🔄 Redirecting to authentication...');
            window.location.href = window.CONNECT_URL || '/pages/connect/';
        }, 2000); // 2 second delay
    }

    _updateLocalStorage() {
        try {
            const sessionData = {
                isLoggedIn: this.session.info.isLoggedIn,
                webId: this.session.info.webId,
                sessionId: this.session.info.sessionId,
                timestamp: Date.now()
            };
            localStorage.setItem('mera_solid_session', JSON.stringify(sessionData));
            console.log('💾 Updated localStorage with current session');
        } catch (error) {
            console.warn('⚠️ Failed to update localStorage:', error);
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

        // If we're using restored session data, we're good
        if (this.initialized && this.podUrl) {
            return true;
        }

        // If we have an active Solid session, we're good
        if (this.initialized && this.session?.info?.isLoggedIn) {
            return true;
        }

        // Otherwise, something failed
        return false;
    }

    // Utility Methods

    getDebugInfo() {
        return {
            initialized: this.initialized,
            isLoggedIn: this.session?.info?.isLoggedIn || false,
            webId: this.session?.info?.webId || null,
            sessionId: this.session?.info?.sessionId || null,
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
document.addEventListener('DOMContentLoaded', function () {
    // Create and expose the singleton instance
    window.meraBridge = new MeraBridge();

    // Also expose the class for debugging
    window.MeraBridge = MeraBridge;

    console.log('🌉 Mera Bridge loaded and ready');
});