// Type definitions for Solid Client libraries
interface SolidSession {
    info: {
        isLoggedIn: boolean;
        webId?: string;
    };
    handleIncomingRedirect(url: string): Promise<void>;
    login(options: any): Promise<void>;
    logout(): Promise<void>;
}

interface SolidClientAuthentication {
    getDefaultSession(): SolidSession;
}

// Extend the global Window interface
declare global {
    interface Window {
        solidClientAuthentication: SolidClientAuthentication;
        solidClient?: any; // Your other Solid libraries if needed
    }
}

// This makes the file a module (required for global declarations)
export {};