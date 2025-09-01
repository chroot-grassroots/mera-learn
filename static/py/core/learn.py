from js import document, window, fetch
import asyncio

async def load_module(module_name):
    """Load a Python module using direct fetch method."""
    try:
        response = await fetch(f'/static/py/{module_name}.py')
        if response.ok:
            module_code = await response.text()
            exec(module_code, globals())
            print(f'✅ {module_name}.py loaded successfully')
            return True
        else:
            print(f'❌ Failed to load {module_name}: {response.status}')
            return False
    except Exception as e:
        print(f'❌ Error loading {module_name}: {e}')
        return False

async def check_authentication():
    """Check if user is authenticated via multiple fallback methods."""
    auth_status_div = document.getElementById('auth-status')
    learning_content_div = document.getElementById('learning-content')
    
    try:
        print('🔍 Starting authentication check...')
        
        # Method 1: Direct Solid session check with forced refresh
        session_info = None
        if hasattr(window, 'solidClientAuthentication'):
            print('🔄 Checking existing Solid session...')
            session = window.solidClientAuthentication.getDefaultSession()
            
            # Force a session refresh by trying to restore from browser storage
            try:
                print('🔄 Attempting to restore session from browser storage...')
                # Don't pass any URL to avoid interfering with other OAuth flows
                await session.handleIncomingRedirect('')
                await asyncio.sleep(0.5)  # Brief wait for restoration
            except Exception as e:
                print(f'Session restoration attempt: {e}')
            
            # Now check the session state
            session_info_raw = session.info
            
            if session_info_raw:
                # Handle PyScript object conversion
                if hasattr(session_info_raw, 'to_py'):
                    session_info_dict = session_info_raw.to_py()
                else:
                    # Fallback: access as JavaScript object
                    session_info_dict = {
                        'isLoggedIn': getattr(session_info_raw, 'isLoggedIn', False),
                        'webId': getattr(session_info_raw, 'webId', None)
                    }
                
                session_info = {
                    'isLoggedIn': session_info_dict.get('isLoggedIn', False),
                    'webId': session_info_dict.get('webId', None)
                }
                print(f'🔍 Direct session check: isLoggedIn={session_info["isLoggedIn"]}, webId={session_info.get("webId", "None")}')
            else:
                session_info = {'isLoggedIn': False, 'webId': None}
                print('🔍 No session info available')
        
        # Method 2: Check localStorage backup (fallback)
        if not session_info or not session_info.get('isLoggedIn', False):
            try:
                print('🔄 Checking localStorage backup...')
                import js
                stored_session = js.localStorage.getItem('mera_solid_session_backup')
                if stored_session:
                    stored_data = js.JSON.parse(stored_session)
                    # Convert JsProxy to Python dict
                    if hasattr(stored_data, 'to_py'):
                        stored_dict = stored_data.to_py()
                    else:
                        stored_dict = {
                            'webId': getattr(stored_data, 'webId', None),
                            'timestamp': getattr(stored_data, 'timestamp', 0),
                            'isLoggedIn': getattr(stored_data, 'isLoggedIn', False)
                        }
                    
                    # Check if session is recent (within 1 hour - much more generous)
                    current_time = js.Date.now()
                    stored_time = stored_dict.get('timestamp', 0)
                    age = current_time - stored_time
                    max_age = 60 * 60 * 1000  # 1 hour in milliseconds
                    
                    print(f'💾 Timestamp debug:')
                    print(f'   Current time: {current_time}')
                    print(f'   Stored time: {stored_time}')
                    print(f'   Age calculation: {current_time} - {stored_time} = {age}ms')
                    print(f'   Max age: {max_age}ms')
                    print(f'   Age in seconds: {age/1000}')
                    print(f'   Is recent: {age < max_age}')
                    
                    if age < max_age and age >= 0:  # Also check age is not negative
                        session_info = {
                            'isLoggedIn': True,
                            'webId': stored_dict.get('webId')
                        }
                        print(f'💾 Using localStorage backup: {stored_dict.get("webId")}')
                    else:
                        if age < 0:
                            print(f'💾 localStorage backup has future timestamp (clock skew?), ignoring')
                        else:
                            print(f'💾 localStorage backup too old ({age/1000}s > {max_age/1000}s), ignoring')
                else:
                    print('💾 No localStorage backup found')
            except Exception as e:
                print(f'localStorage check failed: {e}')
        
        # Display results
        if session_info and session_info.get('isLoggedIn', False):
            webid = session_info.get('webId', 'Unknown')
            print(f'✅ Authentication successful! WebID: {webid}')
            
            # Show success UI
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
            print("🎉 Learning environment displayed!")
            
        else:
            print("❌ No valid session found, redirecting to hello")
            window.location.href = window.HELLO_URL
            
    except Exception as e:
        print(f'❌ Authentication check failed: {e}')
        show_error(f"Authentication check failed: {e}")

def show_error(message):
    """Show error message in auth status div."""
    auth_status_div = document.getElementById('auth-status')
    if auth_status_div:
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

def initialize_learn_page():
    """Initialize the learning page."""
    print("🐍 Core learn.py module loaded!")
    print("🔍 Starting authentication check task...")
    asyncio.create_task(check_authentication())
    print("✅ Authentication check task created!")

# Auto-initialize when module loads
initialize_learn_page()