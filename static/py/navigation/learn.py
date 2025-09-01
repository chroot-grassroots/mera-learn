from js import document, window
import asyncio

async def check_authentication():
    """Check if user is authenticated via multiple fallback methods."""
    auth_status_div = document.getElementById('auth-status')
    learning_content_div = document.getElementById('learning-content')
    
    try:
        print('🔍 Starting authentication check...')
        
        # ALWAYS attempt session restoration on page load
        session = None
        if hasattr(window, 'solidClientAuthentication'):
            session = window.solidClientAuthentication.getDefaultSession()
            
            print('🔄 Attempting session restoration from storage...')
            # This should restore from IndexedDB/localStorage automatically
            await session.handleIncomingRedirect(window.location.href)
            
            # Give session time to restore from storage
            await asyncio.sleep(2)
            
            # Check if session was restored
            session_info_raw = session.info
            print(f'📋 Session after restoration attempt: {session_info_raw}')
            
            if session_info_raw:
                session_info_dict = session_info_raw.to_py()
                is_logged_in = session_info_dict.get('isLoggedIn', False)
                webid = session_info_dict.get('webId', None)
                
                print(f'🔍 Session state: isLoggedIn={is_logged_in}, webId={webid}')
                
                if is_logged_in:
                    # Success! Show authenticated UI
                    auth_status_div.innerHTML = f"""
                        <div class="flex items-center justify-center space-x-2 text-green-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                            </svg>
                            <span class="font-semibold">✅ Connected to Solid Pod</span>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">WebID: {webid}</p>
                    """
                    learning_content_div.classList.remove('hidden')
                    print("🎉 Successfully displayed learning environment!")
                    return
        
        # If we get here, authentication failed
        print("❌ No valid session found, redirecting to hello")
        window.location.href = window.HELLO_URL
            
    except Exception as e:
        print(f"❌ Authentication check failed: {e}")
        window.location.href = window.HELLO_URL

def show_error(message):
    """Show error message in auth status div."""
    auth_status_div = document.getElementById("auth-status")
    auth_status_div.innerHTML = f"""
        <div class="flex items-center justify-center space-x-2 text-red-600">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span class="font-semibold">❌ Authentication Error</span>
        </div>
        <p class="text-sm text-red-500 mt-2">{message}</p>
        <a href="{window.HELLO_URL}" class="inline-block mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm">
            Try Again
        </a>
    """


print("🐍 Learn.py module loaded!")
print("🔍 Starting authentication check task...")

# Start authentication check when page loads
asyncio.create_task(check_authentication())

print("✅ Authentication check task created!")
