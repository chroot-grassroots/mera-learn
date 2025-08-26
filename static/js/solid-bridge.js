/**
 * JavaScript bridge for Solid Pod operations
 * Exposes Solid client functions to PyScript
 */

// Wait for both libraries to load
window.solidBridge = {
    // Check if libraries are ready
    isReady: () => {
        return typeof window.solidClientAuthentication !== 'undefined' && 
               typeof window.solidClient !== 'undefined';
    },

    // Save data to Solid Pod
    saveData: async (url, jsonData, authSession) => {
        try {
            console.log('SolidBridge: Saving data to', url);
            
            // Create a Blob with the JSON data
            const blob = new Blob([jsonData], { type: 'application/json' });
            const file = new File([blob], 'progress.json', { type: 'application/json' });
            
            // Use Solid client to save the file
            const savedFile = await window.solidClient.saveFileInContainer(
                url,
                file,
                {
                    slug: url.split('/').pop(),
                    contentType: 'application/json'
                }
            );
            
            console.log('SolidBridge: File saved successfully', savedFile);
            return { success: true, url: savedFile };
            
        } catch (error) {
            console.error('SolidBridge: Save error', error);
            return { success: false, error: error.message };
        }
    },

    // Load data from Solid Pod
    loadData: async (url, authSession) => {
        try {
            console.log('SolidBridge: Loading data from', url);
            
            // Try to fetch the file
            const file = await window.solidClient.getFile(url, { fetch: authSession.fetch });
            const text = await file.text();
            const data = JSON.parse(text);
            
            console.log('SolidBridge: Data loaded successfully');
            return { success: true, data: data };
            
        } catch (error) {
            console.error('SolidBridge: Load error', error);
            return { success: false, error: error.message };
        }
    },

    // Test function
    test: () => {
        console.log('SolidBridge: Test function called');
        return {
            solidClientAuthentication: typeof window.solidClientAuthentication !== 'undefined',
            solidClient: typeof window.solidClient !== 'undefined',
            bridge: true
        };
    }
};

console.log('SolidBridge: JavaScript bridge initialized');