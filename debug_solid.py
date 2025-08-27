#!/usr/bin/env python3

"""
Standalone script to test Solid library loading without touching Django code.
Run with: python debug_solid.py
"""

def create_test_html():
    """Create a standalone test HTML file."""
    html_content = """
<!DOCTYPE html>
<html>
<head>
    <title>Solid CDN Debug Test</title>
    <style>
        body { font-family: monospace; padding: 20px; }
        .result { margin: 10px 0; padding: 10px; border: 1px solid #ccc; }
        .pass { background: #d4edda; }
        .fail { background: #f8d7da; }
        .info { background: #e2e3e5; }
    </style>
</head>
<body>
    <h1>Solid Library CDN Debug Test</h1>
    <p><strong>Instructions:</strong> Open Browser DevTools (F12) → Network tab, then reload page</p>
    <div id="results"></div>

    <!-- Test multiple CDN sources -->
    <script src="https://unpkg.com/@inrupt/solid-client-authn-browser@1.17.5/dist/solid-client-authn.bundle.js"></script>
    
    <!-- Try different CDNs for solid-client -->
    <script id="unpkg-test" src="https://unpkg.com/@inrupt/solid-client@1.30.2/dist/solid-client.bundle.js" 
            onerror="logError('unpkg solid-client failed')"></script>
    <script id="jsdelivr-test" src="https://cdn.jsdelivr.net/npm/@inrupt/solid-client@1.30.2/dist/solid-client.bundle.js" 
            onerror="logError('jsdelivr solid-client failed')"></script>
    <script id="skypack-test" src="https://cdn.skypack.dev/@inrupt/solid-client@1.30.2" 
            onerror="logError('skypack solid-client failed')"></script>
    
    <script>
        function log(message, type = 'info') {
            const div = document.createElement('div');
            div.className = 'result ' + type;
            div.textContent = new Date().toISOString() + ': ' + message;
            document.getElementById('results').appendChild(div);
            console.log(message);
        }
        
        function logError(message) {
            log(message, 'fail');
        }

        // Test after all scripts have had time to load
        setTimeout(() => {
            log('=== TESTING LIBRARY AVAILABILITY ===');
            
            const authAvailable = typeof window.solidClientAuthentication !== 'undefined';
            const clientAvailable = typeof window.solidClient !== 'undefined';
            
            log(`solidClientAuthentication: ${authAvailable}`, authAvailable ? 'pass' : 'fail');
            log(`solidClient: ${clientAvailable}`, clientAvailable ? 'pass' : 'fail');
            
            // Check what's actually on window
            const allKeys = Object.keys(window).filter(k => k.includes('solid') || k.includes('Solid'));
            log(`All solid-related window keys: [${allKeys.join(', ')}]`);
            
            // Check for common variations
            const variations = ['solidClient', 'SolidClient', '@inrupt/solid-client'];
            variations.forEach(key => {
                const exists = typeof window[key] !== 'undefined';
                log(`window.${key}: ${exists}`, exists ? 'pass' : 'fail');
            });
            
            log('=== CHECK BROWSER NETWORK TAB FOR FAILED REQUESTS ===');
            
        }, 4000);
    </script>
</body>
</html>
"""
    
    # Write to a temporary file outside your project
    import tempfile
    import os
    
    temp_dir = tempfile.gettempdir()
    test_file = os.path.join(temp_dir, 'solid-debug-test.html')
    
    with open(test_file, 'w') as f:
        f.write(html_content)
    
    print(f"✅ Test file created: {test_file}")
    print(f"🌐 Open this file directly in your browser to test CDN loading")
    print(f"💡 Or run: firefox {test_file}  # (or chrome, etc.)")
    
    return test_file

if __name__ == '__main__':
    create_test_html()