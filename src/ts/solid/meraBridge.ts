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
 * - Trust Solid Client's built-in session persistence
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
   * 
   * Trusts Solid Client's built-in persistence:
   * - getDefaultSession() auto-restores from localStorage
   * - handleIncomingRedirect() handles both OAuth callbacks AND restoration
   * - No manual timestamp tracking needed
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
      // Step 1: Get session
      this.session = getDefaultSession();
      console.log('📍 Step 1: Initial session check:', {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId,
      });

      // Step 2: Call handleIncomingRedirect with restorePreviousSession option
      // This handles BOTH:
      // - OAuth callbacks (when URL has ?code=...)
      // - Session restoration from localStorage (when restorePreviousSession: true)
      console.log('📍 Step 2: Calling handleIncomingRedirect...');
      await this.session.handleIncomingRedirect({
        url: window.location.href,
        restorePreviousSession: true,  // CRITICAL: tells Solid to check localStorage
      });
      console.log('📍 Step 3: handleIncomingRedirect completed');

      // Step 3: Get fresh session after handleIncomingRedirect
      this.session = getDefaultSession();
      console.log('📍 Step 4: Session after handleIncomingRedirect:', {
        sessionId: this.session.info.sessionId,
        isLoggedIn: this.session.info.isLoggedIn,
        webId: this.session.info.webId,
      });

      // Step 4: Check if logged in
      if (this.session.info.isLoggedIn) {
        console.log('✅ User authenticated');
        await this._extractPodUrl();
        this.initialized = true;
        return true;
      } else {
        console.log('⚠️ User not authenticated');
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
   * Trusts Solid Client's session state
   */
  public async check(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.session?.info.isLoggedIn || false;
  }

  /**
   * Logout user
   * Solid Client handles clearing its own localStorage
   */
  public async logout(): Promise<void> {
    if (this.session) {
      await this.session.logout();
      this.initialized = false;
      console.log('🚪 Logged out');
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
        
        // Skip Solid Client's own localStorage keys
        if (key?.startsWith('mera_')) {
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
   * Clear all Mera data from localStorage
   * Does NOT touch Solid Client's authentication data
   */
  public clearLocalData(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('mera_')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log('🧹 Cleared local data:', keysToRemove.length, 'files');
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
  } {
    return {
      initialized: this.initialized,
      isLoggedIn: this.session?.info?.isLoggedIn || false,
      webId: this.session?.info?.webId || null,
      sessionId: this.session?.info?.sessionId || null,
      podUrl: this.podUrl,
    };
  }
}

// Create singleton instance and expose globally
const bridgeInstance = MeraBridge.getInstance();

// Expose to window for non-module scripts
(window as any).meraBridge = bridgeInstance;
(window as any).MeraBridge = MeraBridge;

// Export for ES modules
export default bridgeInstance;