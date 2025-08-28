"""
Main application module for Mera platform.
Handles application initialization without event decorators.
"""

# Global variables 
solid_auth = None
update_debug_func = None


def initialize_solid_auth(debug_callback):
    """Initialize the SolidAuth system with debug callback."""
    global solid_auth, update_debug_func
    update_debug_func = debug_callback
    
    # Create SolidAuth instance (class should be available from solid_auth.py)
    solid_auth = SolidAuth(debug_callback=debug_callback)
    debug_callback("🔒 Solid Pod authentication ready!")
    return solid_auth


def test_js_access():
    """Test JavaScript library access."""
    if not update_debug_func:
        print("No debug callback available")
        return
        
    update_debug_func("Testing library access...")
    
    try:
        import js
        has_auth = hasattr(js, 'solidClientAuthentication')
        has_client = hasattr(js, 'solidClient')
        
        update_debug_func(f"solidClientAuthentication: {has_auth}")
        update_debug_func(f"solidClient: {has_client}")
        
        if has_auth and has_client:
            update_debug_func("🎉 Both Solid libraries are working!")
        
    except Exception as e:
        update_debug_func(f"Error: {e}")


async def handle_solidcommunity_login():
    """Handle SolidCommunity.net login."""
    if not solid_auth or not update_debug_func:
        return
        
    update_debug_func("🌐 Connecting to SolidCommunity.net...")
    is_logged_in = solid_auth.check_session()
    if not is_logged_in:
        await solid_auth.login("https://solidcommunity.net")
    else:
        update_debug_func("Already connected!")


async def handle_custom_login(custom_url):
    """Handle custom pod provider login."""
    if not solid_auth or not update_debug_func:
        return
        
    if custom_url:
        update_debug_func(f"🔧 Connecting to {custom_url}...")
        await solid_auth.login(custom_url)
    else:
        update_debug_func("Please enter a pod provider URL")