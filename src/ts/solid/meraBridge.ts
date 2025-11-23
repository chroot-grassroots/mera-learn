/**
 * meraBridge.ts - Storage Bridge for Mera Platform
 * 
 * Provides unified interface for dual storage:
 * - Local: Browser localStorage for offline capability
 * - Remote: Solid Pod for data sovereignty and sync
 * 
 * Uses @inrupt/solid-client for robust Pod operations
 * Uses @inrupt/solid-client-authn-browser for authentication
 * 
 * Design principles:
 * - Singleton pattern for global access
 * - Consistent BridgeResult interface
 * - Session state management with timestamp tracking
 * - Breaking change isolation from Inrupt library updates
 */

import {
  overwriteFile,
  getFile,
  deleteFile,
  getSolidDataset,
  getContainedResourceUrlAll,
  createContainerAt,
} from '@inrupt/solid-client';
import {
  getDefaultSession,
  Session,
} from '@inrupt/solid-client-authn-browser';

// ============================================================================
// Type Definitions
// ============================================================================

const AUTH_TIMESTAMP_KEY = 'mera_last_auth';

export enum BridgeErrorType {
  Authentication = 'authentication',
  Network = 'network',
  NotFound = 'not_found',
  Storage = 'storage',
  Validation = 'validation',
}

export interface BridgeResult<T = any> {
  success: boolean;
  data?: T;
  error?: string | null;
  errorType?: BridgeErrorType;
}

interface SessionData {
  isLoggedIn: boolean;
  webId: string;
  sessionId: string;
  timestamp: number;
}

// ============================================================================
// MeraBridge Class
// ============================================================================

export class MeraBridge {
  private static instance: MeraBridge | null = null;
  
  private session: Session | null = null;
  private podUrl: string | null = null;
  private initialized: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;

  private constructor() {
    // Private constructor enforces singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MeraBridge {
    if (!MeraBridge.instance) {
      MeraBridge.instance = new MeraBridge();
    }
    return MeraBridge.instance;
  }

  // ==========================================================================
  // Initialization & Session Management
  // ==========================================================================

  /**
   * Initialize bridge - ensures session is ready and Pod URL is extracted
   */
  public async initialize(): Promise<boolean> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  private async _doInitialize(): Promise<boolean> {
    console.log('🌉 Mera Bridge initializing...');

    try {
      // Get default session from Solid client
      this.session = getDefaultSession();
      console.log('📍 Step 1: Got initial session:', {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId
      });

      // Let session handle incoming redirect first (OAuth callback)
      console.log('📍 Step 2: Calling handleIncomingRedirect with URL:', window.location.href);
      await this.session.handleIncomingRedirect(window.location.href);
      console.log('📍 Step 3: handleIncomingRedirect completed');

      // Check session BEFORE re-fetch
      console.log('📍 Step 4: Session info BEFORE re-fetch:', {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId
      });

      // CRITICAL: Give Solid time to update session object internally
      // Session restoration from localStorage happens asynchronously
      console.log('📍 Step 4.5: Waiting 100ms for session restoration to complete...');
      await new Promise(resolve => setTimeout(resolve, 100));

      // CRITICAL: Re-fetch session after redirect handling
      this.session = getDefaultSession();
      console.log('📍 Step 5: Session info AFTER re-fetch:', {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId
      });

      // Update timestamp if successfully logged in
      if (this.session.info.isLoggedIn) {
        this._updateAuthTimestamp();
        console.log('✅ Auth timestamp updated');
        
        // Extract Pod URL
        await this._extractPodUrl();
        
        this.initialized = true;
        console.log('🌉 Mera Bridge initialized successfully');
        return true;
      } else {
        console.log('⚠️ Session not authenticated after all steps');
        this.initialized = false;
        return false;
      }
    } catch (error) {
      console.error('❌ Bridge initialization failed:', error);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Extract Pod URL from authenticated session
   */
  private async _extractPodUrl(): Promise<void> {
    if (!this.session?.info.isLoggedIn) {
      throw new Error('Cannot extract Pod URL: not authenticated');
    }

    const webId = this.session.info.webId;
    if (!webId) {
      throw new Error('WebID not available in session');
    }

    // Extract Pod URL from WebID (typically WebID = Pod URL + /profile/card#me)
    const webIdUrl = new URL(webId);
    this.podUrl = `${webIdUrl.protocol}//${webIdUrl.host}`;
    
    console.log('📦 Pod URL extracted:', this.podUrl);
  }

  /**
   * Check if user is authenticated
   */
  public async check(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.session?.info.isLoggedIn || false;
  }

  /**
   * Logout user and clear auth timestamp
   */
  public async logout(): Promise<void> {
    if (this.session) {
      await this.session.logout();
      this._clearAuthTimestamp();
      this.initialized = false;
      console.log('🚪 Logged out and cleared auth timestamp');
    }
  }

  /**
   * Update auth timestamp after successful login or session restoration
   */
  private _updateAuthTimestamp(): void {
    localStorage.setItem(AUTH_TIMESTAMP_KEY, Date.now().toString());
  }

  /**
   * Clear auth timestamp on logout
   */
  private _clearAuthTimestamp(): void {
    localStorage.setItem(AUTH_TIMESTAMP_KEY, '0');
  }

  // ==========================================================================
  // Solid Pod Operations
  // ==========================================================================

  /**
   * Save data to Solid Pod
   */
  public async solidSave(filename: string, data: any): Promise<BridgeResult> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: 'Not authenticated',
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: 'Pod URL not available',
          errorType: BridgeErrorType.Authentication,
        };
      }

      // Ensure mera-learn container exists
      const containerUrl = `${this.podUrl}/mera-learn/`;
      try {
        await createContainerAt(containerUrl, { fetch: this.session.fetch });
      } catch {
        // Container might already exist, that's fine
      }

      // Save file
      const fileUrl = `${containerUrl}${filename}`;
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      
      await overwriteFile(fileUrl, blob, { 
        contentType: 'application/json',
        fetch: this.session.fetch 
      });

      console.log('💾 Saved to Pod:', filename);
      return { success: true, error: null };

    } catch (error) {
      const errorType = this._classifyError(error);
      console.error('❌ Pod save failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType,
      };
    }
  }

  /**
   * Load data from Solid Pod
   */
  public async solidLoad(filename: string): Promise<BridgeResult> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: 'Not authenticated',
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: 'Pod URL not available',
          errorType: BridgeErrorType.Authentication,
        };
      }

      const fileUrl = `${this.podUrl}/mera-learn/${filename}`;
      const file = await getFile(fileUrl, { fetch: this.session.fetch });
      const text = await file.text();
      const data = JSON.parse(text);

      console.log('📥 Loaded from Pod:', filename);
      return { success: true, data, error: null };

    } catch (error) {
      const errorType = this._classifyError(error);
      console.error('❌ Pod load failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType,
      };
    }
  }

  /**
   * Delete file from Solid Pod
   */
  public async solidDelete(filename: string): Promise<BridgeResult> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: 'Not authenticated',
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: 'Pod URL not available',
          errorType: BridgeErrorType.Authentication,
        };
      }

      const fileUrl = `${this.podUrl}/mera-learn/${filename}`;
      await deleteFile(fileUrl, { fetch: this.session.fetch });

      console.log('🗑️ Deleted from Pod:', filename);
      return { success: true, error: null };

    } catch (error) {
      const errorType = this._classifyError(error);
      console.error('❌ Pod delete failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType,
      };
    }
  }

  /**
   * List files in Solid Pod mera-learn container
   * @param pattern - Optional glob pattern (e.g., "mera.*.*.*.sp.*.json")
   */
  public async solidList(pattern?: string): Promise<BridgeResult<string[]>> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.session?.info.isLoggedIn) {
        return {
          success: false,
          error: 'Not authenticated',
          errorType: BridgeErrorType.Authentication,
        };
      }

      if (!this.podUrl) {
        return {
          success: false,
          error: 'Pod URL not available',
          errorType: BridgeErrorType.Authentication,
        };
      }

      const containerUrl = `${this.podUrl}/mera-learn/`;
      const dataset = await getSolidDataset(containerUrl, { fetch: this.session.fetch });
      const fileUrls = getContainedResourceUrlAll(dataset);
      
      // Extract filenames and filter by pattern if provided
      const filenames = fileUrls
        .map(url => {
          const parts = url.split('/');
          return parts[parts.length - 1];
        })
        .filter(filename => {
          if (pattern) {
            return this._matchesPattern(filename, pattern);
          }
          return true;
        });

      console.log('📋 Listed Pod files:', filenames.length);
      return { success: true, data: filenames, error: null };

    } catch (error) {
      const errorType = this._classifyError(error);
      console.error('❌ Pod list failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType,
      };
    }
  }

  // ==========================================================================
  // Local Storage Operations
  // ==========================================================================

  /**
   * Save data to localStorage
   */
  public async localSave(filename: string, data: any): Promise<BridgeResult> {
    try {
      const key = `mera_${filename}`;
      localStorage.setItem(key, JSON.stringify(data));
      
      console.log('💾 Saved to localStorage:', filename);
      return { success: true, error: null };

    } catch (error) {
      console.error('❌ localStorage save failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * Load data from localStorage
   */
  public async localLoad(filename: string): Promise<BridgeResult> {
    try {
      const key = `mera_${filename}`;
      const item = localStorage.getItem(key);
      
      if (!item) {
        return {
          success: false,
          error: 'File not found',
          errorType: BridgeErrorType.NotFound,
        };
      }

      const data = JSON.parse(item);
      
      console.log('📥 Loaded from localStorage:', filename);
      return { success: true, data, error: null };

    } catch (error) {
      console.error('❌ localStorage load failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * Delete file from localStorage
   */
  public async localDelete(filename: string): Promise<BridgeResult> {
    try {
      const key = `mera_${filename}`;
      localStorage.removeItem(key);
      
      console.log('🗑️ Deleted from localStorage:', filename);
      return { success: true, error: null };

    } catch (error) {
      console.error('❌ localStorage delete failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * List files in localStorage with mera_ prefix
   * @param pattern - Optional glob pattern (e.g., "mera.*.*.*.lofp.*.json")
   */
  public async localList(pattern?: string): Promise<BridgeResult<string[]>> {
    try {
      const filenames: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('mera_') && key !== AUTH_TIMESTAMP_KEY) {
          // Remove 'mera_' prefix
          const filename = key.substring(5);
          
          // Filter by pattern if provided
          if (pattern) {
            if (this._matchesPattern(filename, pattern)) {
              filenames.push(filename);
            }
          } else {
            filenames.push(filename);
          }
        }
      }
      
      console.log('📋 Listed localStorage files:', filenames.length);
      return { success: true, data: filenames, error: null };

    } catch (error) {
      console.error('❌ localStorage list failed:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * Clear all Mera data from localStorage (except auth timestamp)
   */
  public clearLocalData(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('mera_') && key !== AUTH_TIMESTAMP_KEY) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('🧹 Cleared local data:', keysToRemove.length, 'files');
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Simple glob pattern matcher
   * Supports * for any characters
   */
  private _matchesPattern(filename: string, pattern: string): boolean {
    // Convert glob pattern to regex
    // Escape special regex chars except *
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars
      .replace(/\*/g, '.*');                    // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filename);
  }

  /**
   * Classify error into BridgeErrorType
   */
  private _classifyError(error: unknown): BridgeErrorType {
    if (!(error instanceof Error)) {
      return BridgeErrorType.Network;
    }

    const message = error.message.toLowerCase();

    if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
      return BridgeErrorType.Authentication;
    }

    if (message.includes('404') || message.includes('not found')) {
      return BridgeErrorType.NotFound;
    }

    if (message.includes('quota') || message.includes('storage')) {
      return BridgeErrorType.Storage;
    }

    return BridgeErrorType.Network;
  }

  /**
   * Get debug information about bridge state
   */
  public getDebugInfo(): {
    initialized: boolean;
    isLoggedIn: boolean;
    webId: string | null;
    sessionId: string | null;
    podUrl: string | null;
    sessionAge: number | null;
  } {
    return {
      initialized: this.initialized,
      isLoggedIn: this.session?.info?.isLoggedIn || false,
      webId: this.session?.info?.webId || null,
      sessionId: this.session?.info?.sessionId || null,
      podUrl: this.podUrl,
      sessionAge: this._getSessionAge(),
    };
  }

  /**
   * Get age of stored auth timestamp in seconds
   */
  private _getSessionAge(): number | null {
    try {
      const timestamp = localStorage.getItem(AUTH_TIMESTAMP_KEY);
      if (!timestamp || timestamp === '0') {
        return null;
      }

      return Math.floor((Date.now() - parseInt(timestamp)) / 1000);
    } catch {
      return null;
    }
  }
}

// Create singleton instance and expose globally
const bridgeInstance = MeraBridge.getInstance();

// Expose to window for non-module scripts
(window as any).meraBridge = bridgeInstance;
(window as any).MeraBridge = MeraBridge;

// Export for ES modules
export default bridgeInstance;