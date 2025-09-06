"""
Solid authentication check and learning page initialization.
Fixed session persistence issues with comprehensive debugging.
"""
import asyncio
from pyodide.ffi import create_proxy
from js import document, window, console
import js


async def check_authentication():
    """
    Check if user is authenticated with comprehensive debugging and error handling.
    
    This function attempts multiple methods to verify authentication:
    1. Direct Solid session check (primary method)
    2. localStorage backup check (fallback method)
    
    Professional error handling includes:
    - Comprehensive logging for debugging
    - Defensive programming with null checks
    - Proper PyScript object handling (dict access vs attribute access)
    - Graceful fallbacks when primary methods fail
    """
    print("🔍 Starting authentication check...")
    
    # Get DOM elements
    auth_status_div = document.getElementById('auth-status')
    learning_content_div = document.getElementById('learning-content')
    
    if not auth_status_div:
        print("❌ Critical error: auth-status div not found")
        return
    
    try:
        session_info = None
        
        # Method 1: Direct Solid session check (primary method)
        print("🔄 Checking existing Solid session...")
        
        # Defensive check for Solid libraries
        if not hasattr(window, 'solidClientAuthentication'):
            print("❌ Solid client authentication not available")
            session_info = {'isLoggedIn': False, 'webId': None}
        else:
            try:
                session = window.solidClientAuthentication.getDefaultSession()
                if session and hasattr(session, 'info') and session.info:
                    session_info_raw = session.info
                    
                    # Professional PyScript object handling
                    # JavaScript objects become Python dicts in PyScript context
                    # Always use dictionary access, not attribute access
                    if hasattr(session_info_raw, 'to_py'):
                        # Convert JsProxy to Python dict if possible
                        session_info_dict = session_info_raw.to_py()
                    else:
                        # Fallback: manual extraction using getattr with defaults
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
                    print('🔍 No session info available from Solid client')
                    
            except Exception as e:
                print(f'🔍 Direct session check failed: {e}')
                session_info = {'isLoggedIn': False, 'webId': None}
        
        # Method 2: localStorage backup check (fallback method)
        if not session_info or not session_info.get('isLoggedIn', False):
            print('🔄 Checking localStorage backup...')
            
            # STANDARDIZED KEY: Use consistent key across all code
            STORAGE_KEY = 'mera_solid_session_backup'
            
            try:
                stored_session = js.localStorage.getItem(STORAGE_KEY)
                
                # Comprehensive debugging of localStorage content
                print(f'💾 Debug localStorage:')
                print(f'   Key used: {STORAGE_KEY}')
                print(f'   Raw stored_session: {stored_session}')
                print(f'   Type of stored_session: {type(stored_session)}')
                print(f'   Stored session is None: {stored_session is None}')
                print(f'   Stored session is empty string: {stored_session == ""}')
                
                if stored_session and stored_session != "null" and stored_session.strip():
                    try:
                        parsed_data = js.JSON.parse(stored_session)
                        print(f'   Parsed data: {parsed_data}')
                        print(f'   Type of parsed data: {type(parsed_data)}')
                        
                        # Try to access properties with comprehensive debugging
                        stored_dict = {}
                        
                        if hasattr(parsed_data, 'to_py'):
                            # JsProxy conversion
                            stored_dict = parsed_data.to_py()
                            print(f'   Converted to Python dict: {stored_dict}')
                        else:
                            # Manual property extraction with error handling
                            try:
                                stored_dict = {
                                    'webId': getattr(parsed_data, 'webId', None),
                                    'timestamp': getattr(parsed_data, 'timestamp', 0),
                                    'isLoggedIn': getattr(parsed_data, 'isLoggedIn', False)
                                }
                                print(f'   Manual extraction result: {stored_dict}')
                            except Exception as extract_error:
                                print(f'   Manual extraction failed: {extract_error}')
                                # Try dictionary-style access as last resort
                                try:
                                    stored_dict = {
                                        'webId': parsed_data['webId'] if 'webId' in parsed_data else None,
                                        'timestamp': parsed_data['timestamp'] if 'timestamp' in parsed_data else 0,
                                        'isLoggedIn': parsed_data['isLoggedIn'] if 'isLoggedIn' in parsed_data else False
                                    }
                                    print(f'   Dictionary access result: {stored_dict}')
                                except Exception as dict_error:
                                    print(f'   Dictionary access failed: {dict_error}')
                                    stored_dict = {'webId': None, 'timestamp': 0, 'isLoggedIn': False}
                        
                        # Timestamp validation with comprehensive debugging
                        current_time = js.Date.now()
                        stored_time = stored_dict.get('timestamp', 0)
                        age = current_time - stored_time
                        max_age = 60 * 60 * 1000  # 1 hour in milliseconds
                        
                        print(f'💾 Timestamp analysis:')
                        print(f'   Current time: {current_time} ({type(current_time)})')
                        print(f'   Stored time: {stored_time} ({type(stored_time)})')
                        print(f'   Age calculation: {current_time} - {stored_time} = {age}ms')
                        print(f'   Max age allowed: {max_age}ms ({max_age/1000}s)')
                        print(f'   Age in seconds: {age/1000}')
                        print(f'   Age >= 0 (not from future): {age >= 0}')
                        print(f'   Age < max_age (not too old): {age < max_age}')
                        print(f'   Is timestamp valid: {age < max_age and age >= 0}')
                        
                        # Additional validation
                        webid = stored_dict.get('webId')
                        is_logged_in = stored_dict.get('isLoggedIn', False)
                        
                        print(f'   WebID: {webid}')
                        print(f'   WebID is valid: {webid and webid.strip() and webid != "null"}')
                        print(f'   isLoggedIn: {is_logged_in}')
                        
                        if (age < max_age and age >= 0 and 
                            webid and webid.strip() and webid != "null" and 
                            is_logged_in):
                            
                            # Validate WebID format (professional validation)
                            try:
                                if webid.startswith('http://') or webid.startswith('https://'):
                                    # Basic URL validation - create URL object to test
                                    test_url = js.URL.new(webid)
                                    print(f'   WebID URL validation: PASSED')
                                    
                                    session_info = {
                                        'isLoggedIn': True,
                                        'webId': webid
                                    }
                                    print(f'💾 ✅ Using valid localStorage backup: {webid}')
                                else:
                                    print(f'   WebID URL validation: FAILED - not a valid URL format')
                            except Exception as url_error:
                                print(f'   WebID URL validation: FAILED - {url_error}')
                        else:
                            # Detailed explanation of why backup was rejected
                            reasons = []
                            if not (age < max_age and age >= 0):
                                if age < 0:
                                    reasons.append(f'timestamp from future (age={age}ms)')
                                else:
                                    reasons.append(f'too old ({age/1000}s > {max_age/1000}s)')
                            if not webid or not webid.strip() or webid == "null":
                                reasons.append('invalid/missing WebID')
                            if not is_logged_in:
                                reasons.append('isLoggedIn=false')
                            
                            print(f'💾 ❌ localStorage backup rejected: {", ".join(reasons)}')
                            
                    except Exception as parse_error:
                        print(f'💾 JSON parsing failed: {parse_error}')
                        print(f'   Raw content that failed to parse: {repr(stored_session)}')
                else:
                    print('💾 No valid localStorage backup found (empty, null, or missing)')
                    
            except Exception as storage_error:
                print(f'💾 localStorage access failed: {storage_error}')
        
        # Method 3: Session bridge fallback (if available)
        if not session_info or not session_info.get('isLoggedIn', False):
            print('🔄 Attempting to restore session from browser storage...')
            
            # Check if session bridge has updated info
            if hasattr(window, '_solidSessionInfo'):
                bridge_info = window._solidSessionInfo
                if bridge_info and getattr(bridge_info, 'isLoggedIn', False):
                    webid = getattr(bridge_info, 'webId', None)
                    if webid and webid.strip():
                        session_info = {
                            'isLoggedIn': True,
                            'webId': webid
                        }
                        print(f'🌉 Using session bridge data: {webid}')
            
            # If still no session, try to restore from Solid's internal storage
            if (not session_info or not session_info.get('isLoggedIn', False) and 
                hasattr(window, 'solidClientAuthentication')):
                try:
                    session = window.solidClientAuthentication.getDefaultSession()
                    # This might trigger internal restoration
                    await session.handleIncomingRedirect(window.location.href)
                    
                    # Check again after potential restoration
                    if session and session.info and getattr(session.info, 'isLoggedIn', False):
                        webid = getattr(session.info, 'webId', None)
                        if webid:
                            session_info = {
                                'isLoggedIn': True,
                                'webId': webid
                            }
                            print(f'🔄 Session restored from internal storage: {webid}')
                except Exception as restore_error:
                    print(f'Session restoration attempt: {restore_error}')
        
        # Display results with professional UI
        if session_info and session_info.get('isLoggedIn', False):
            webid = session_info.get('webId', 'Unknown')
            print(f'✅ Authentication successful! WebID: {webid}')
            
            # Show success UI with professional styling
            auth_status_div.innerHTML = f"""
                <div class="flex items-center justify-center space-x-2 text-green-600">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                    <span class="font-semibold">✅ Connected to Solid Pod</span>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">WebID: {webid}</p>
                <div class="mt-3 text-xs text-gray-500 dark:text-gray-500">
                    <div class="flex items-center space-x-1">
                        <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span>Session active and validated</span>
                    </div>
                </div>
            """
            
            # Show learning content
            if learning_content_div:
                learning_content_div.classList.remove('hidden')
                print("🎉 Learning environment displayed!")
            
        else:
            print("❌ No valid session found, redirecting to hello")
            
            # Show error state before redirect
            auth_status_div.innerHTML = """
                <div class="flex items-center justify-center space-x-2 text-yellow-600">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span class="font-semibold">⚠️ No Active Session</span>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">Redirecting to authentication...</p>
            """
            
            # Delay redirect to allow user to see status
            await asyncio.sleep(2)
            window.location.href = window.HELLO_URL
            
    except Exception as e:
        error_msg = f'Authentication check failed: {e}'
        print(f'❌ {error_msg}')
        
        # Import traceback for detailed error information
        import traceback
        traceback_str = traceback.format_exc()
        print(f'Full traceback:\n{traceback_str}')
        
        show_error(error_msg)


def show_error(message):
    """
    Show professional error message with retry options.
    
    Args:
        message (str): Error message to display to user
    """
    auth_status_div = document.getElementById('auth-status')
    if auth_status_div:
        auth_status_div.innerHTML = f"""
            <div class="flex items-center justify-center space-x-2 text-red-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="font-semibold">❌ Authentication Error</span>
            </div>
            <p class="text-sm text-red-500 mt-2 text-center max-w-md mx-auto">{message}</p>
            <div class="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
                <a href="{window.HELLO_URL}" class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition-colors">
                    Try Again
                </a>
                <button onclick="location.reload()" class="inline-block bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm transition-colors">
                    Reload Page
                </button>
            </div>
        """


def initialize_learn_page():
    """
    Initialize the learning page with comprehensive error handling.
    
    This function sets up the authentication check task and provides
    professional error handling for the learning environment initialization.
    """
    print("🐍 Core learn.py module loaded!")
    print("🔍 Starting authentication check task...")
    
    try:
        asyncio.create_task(check_authentication())
        print("✅ Authentication check task created!")
    except Exception as e:
        print(f"❌ Failed to create authentication check task: {e}")
        show_error(f"Failed to initialize authentication: {e}")


# Auto-initialize when module loads
# This follows the established pattern from your existing codebase
initialize_learn_page()