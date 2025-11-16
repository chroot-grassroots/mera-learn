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
 * - Session state management
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

      // Let session handle incoming redirect first
      await this.session.handleIncomingRedirect(window.location.href);

      // Active session - extract Pod URL
      if (!this.session.info.webId) {
        console.error('❌ Session is logged in but has no webId');
        return false;
      }

      this.podUrl = this._extractPodUrl(this.session.info.webId);
      this.initialized = true;
      console.log('✅ Bridge initialized - Pod:', this.podUrl);
      console.log('✅ WebID:', this.session.info.webId);

      // Ensure mera-learn container exists
      await this._ensureContainer();
      return true;

    } catch (error) {
      console.error('❌ Bridge initialization error:', error);
      return false;
    }
  }

  /**
   * Extract Pod URL from WebID
   * Example: https://user.solidcommunity.net/profile/card#me → https://user.solidcommunity.net/
   */
  private _extractPodUrl(webId: string): string {
    try {
      const url = new URL(webId);
      return `${url.protocol}//${url.host}`;
    } catch (error) {
      console.error('Failed to extract Pod URL from WebID:', webId, error);
      throw new Error('Invalid WebID format');
    }
  }

  /**
   * Ensure /mera-learn/ container exists in Pod
   */
  private async _ensureContainer(): Promise<void> {
    if (!this.initialized || !this.podUrl || !this.session) {
      return;
    }

    try {
      const containerUrl = `${this.podUrl}/mera-learn/`;
      
      // Try to fetch container - if it doesn't exist, create it
      try {
        await getSolidDataset(containerUrl, { fetch: this.session.fetch });
        console.log('✅ Container exists:', containerUrl);
      } catch (error) {
        // Container doesn't exist, create it
        console.log('📁 Creating container:', containerUrl);
        await createContainerAt(containerUrl, { fetch: this.session.fetch });
        console.log('✅ Container created');
      }
    } catch (error) {
      console.warn('⚠️ Failed to ensure container exists:', error);
      // Non-fatal - operations will create it automatically
    }
  }

  /**
   * Check if bridge is ready for operations
   */
  public async check(): Promise<boolean> {
    await this.initialize();
    return this.initialized && this.podUrl !== null;
  }

  // ==========================================================================
  // Solid Pod Operations
  // ==========================================================================

  /**
   * Save data to Solid Pod
   */
  public async solidSave(filename: string, data: any): Promise<BridgeResult> {
    await this.initialize();

    if (!this.initialized || !this.podUrl || !this.session) {
      return {
        success: false,
        error: 'Bridge not initialized - authentication required',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const url = `${this.podUrl}/mera-learn/${filename}`;
      console.log('💾 Saving to Solid Pod:', url);

      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      await overwriteFile(url, blob, { fetch: this.session.fetch });

      console.log('✅ Solid save successful:', filename);
      return { success: true, error: null };

    } catch (error) {
      console.error('❌ Solid save failed:', filename, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: this._classifyError(error),
      };
    }
  }

  /**
   * Load data from Solid Pod
   */
  public async solidLoad(filename: string): Promise<BridgeResult> {
    await this.initialize();

    if (!this.initialized || !this.podUrl || !this.session) {
      return {
        success: false,
        data: null,
        error: 'Bridge not initialized - authentication required',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const url = `${this.podUrl}/mera-learn/${filename}`;
      console.log('📥 Loading from Solid Pod:', url);

      const file = await getFile(url, { fetch: this.session.fetch });
      const text = await file.text();
      const data = JSON.parse(text);

      console.log('✅ Solid load successful:', filename);
      return { success: true, data, error: null };

    } catch (error) {
      // Check if it's a 404
      if (error instanceof Error && error.message.includes('404')) {
        console.log('📄 File not found in Solid Pod:', filename);
        return {
          success: false,
          data: null,
          error: 'File not found',
          errorType: BridgeErrorType.NotFound,
        };
      }

      console.error('❌ Solid load failed:', filename, error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: this._classifyError(error),
      };
    }
  }

  /**
   * Delete file from Solid Pod
   */
  public async solidDelete(filename: string): Promise<BridgeResult> {
    await this.initialize();

    if (!this.initialized || !this.podUrl || !this.session) {
      return {
        success: false,
        error: 'Bridge not initialized - authentication required',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const url = `${this.podUrl}/mera-learn/${filename}`;
      console.log('🗑️ Deleting from Solid Pod:', url);

      await deleteFile(url, { fetch: this.session.fetch });

      console.log('✅ Solid delete successful:', filename);
      return { success: true, error: null };

    } catch (error) {
      // Check if it's a 404 - that's fine, file already doesn't exist
      if (error instanceof Error && error.message.includes('404')) {
        console.log('📄 File already deleted (404):', filename);
        return { success: true, error: null };
      }

      console.error('❌ Solid delete failed:', filename, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: this._classifyError(error),
      };
    }
  }

  /**
   * List files in Solid Pod /mera-learn/ container
   */
  public async solidList(pattern?: string): Promise<BridgeResult<string[]>> {
    await this.initialize();

    if (!this.initialized || !this.podUrl || !this.session) {
      return {
        success: false,
        data: [],
        error: 'Bridge not initialized - authentication required',
        errorType: BridgeErrorType.Authentication,
      };
    }

    try {
      const containerUrl = `${this.podUrl}/mera-learn/`;
      console.log('📋 Listing Solid Pod files:', containerUrl);

      const dataset = await getSolidDataset(containerUrl, {
        fetch: this.session.fetch,
      });
      const urls = getContainedResourceUrlAll(dataset);

      // Extract filenames from full URLs
      const filenames = urls.map((url) => {
        const parts = url.split('/');
        return parts[parts.length - 1];
      });

      // Optional: filter by pattern
      const filtered = pattern
        ? filenames.filter((name) => name.includes(pattern))
        : filenames;

      console.log(`✅ Found ${filtered.length} files in Solid Pod`);
      return { success: true, data: filtered, error: null };

    } catch (error) {
      console.error('❌ Solid list failed:', error);
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: this._classifyError(error),
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
      console.log('💾 Local save successful:', filename);
      return { success: true, error: null };

    } catch (error) {
      console.error('❌ Local save failed:', filename, error);
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
      const data = localStorage.getItem(key);

      if (data) {
        const parsed = JSON.parse(data);
        console.log('📥 Local load successful:', filename);
        return { success: true, data: parsed, error: null };
      } else {
        console.log('📄 File not found in local storage:', filename);
        return {
          success: false,
          data: null,
          error: 'File not found',
          errorType: BridgeErrorType.NotFound,
        };
      }
    } catch (error) {
      console.error('❌ Local load failed:', filename, error);
      return {
        success: false,
        data: null,
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
      console.log('🗑️ Local delete successful:', filename);
      return { success: true, error: null };

    } catch (error) {
      console.error('❌ Local delete failed:', filename, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  /**
   * List files in localStorage matching mera_ prefix
   */
  public async localList(pattern?: string): Promise<BridgeResult<string[]>> {
    try {
      const allKeys = Object.keys(localStorage);
      const meraKeys = allKeys.filter((key) => key.startsWith('mera_'));
      const filenames = meraKeys.map((key) => key.replace('mera_', ''));

      // Optional: filter by pattern
      const filtered = pattern
        ? filenames.filter((name) => name.includes(pattern))
        : filenames;

      console.log(`✅ Found ${filtered.length} files in localStorage`);
      return { success: true, data: filtered, error: null };

    } catch (error) {
      console.error('❌ Local list failed:', error);
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: BridgeErrorType.Storage,
      };
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

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
   * Get age of stored session in seconds
   */
  private _getSessionAge(): number | null {
    try {
      const stored = localStorage.getItem('mera_solid_session');
      if (!stored) return null;

      const sessionData: SessionData = JSON.parse(stored);
      return Math.floor((Date.now() - sessionData.timestamp) / 1000);
    } catch {
      return null;
    }
  }
}

// Export for ES modules
export default MeraBridge;