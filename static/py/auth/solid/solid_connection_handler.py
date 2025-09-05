"""
OAuth flow handler - extracted from auth_flow_manager.py for clarity.
Handles the complete Solid Pod OAuth authentication flow.
"""
import asyncio
from js import document, window, console, URL
import js

# PyScript shared global scope - for type checking only
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from pyscript_globals import (
        handle_solid_connection,
        show_error,
        show_loading,
        show_success,
        SolidClientWrapper,
        load_solid_client_wrapper,
        check_authentication,
        setup_retry_button,
        SOLID_SESSION_BACKUP_KEY,
        STORAGE_KEY
    )


# Storage key constant
SOLID_SESSION_BACKUP_KEY = 'mera_solid_session_backup'

async def handle_solid_connection():
    """
    Handle Solid OAuth connection with PyScript-compatible imports and fixed OAuth flow.
    
    This function implements the corrected OAuth flow:
    1. Check if this is an OAuth callback (has code/state parameters)
    2. If callback: Process tokens and establish session
    3. If not callback: Check if already logged in, otherwise start OAuth flow
    
    Key fixes:
    - OAuth initiation code moved inside proper conditional block
    - Enhanced error handling and debugging
    - PyScript-compatible import patterns
    - Consistent localStorage key usage
    """
    print("🔗 Solid OAuth handler loaded!")
    print("🔄 Starting handle_solid_connection...")
    
    # Initialize UI
    show_loading()
    
    # Hide error section if visible
    error_section = document.getElementById('error-section')
    if error_section:
        error_section.classList.add('hidden')
    
    try:
        # Handle dynamic loading of SolidClientWrapper if needed
        if SolidClientWrapper is None:
            print("🔄 Loading SolidClientWrapper dynamically...")
            success = await load_solid_client_wrapper()
            if not success:
                raise Exception("Failed to load SolidClientWrapper module dynamically")
            print("✅ SolidClientWrapper loaded dynamically")
        
        # Verify SolidClientWrapper is available
        if 'SolidClientWrapper' not in globals():
            raise Exception("SolidClientWrapper class not available after import attempts")
        
        print("✅ SolidClientWrapper module loaded successfully")
        
        # Verify Solid libraries are available
        if not hasattr(window, 'solidClientAuthentication'):
            raise Exception("Solid client libraries not loaded")
        print("✅ Solid libraries are available")
        
        # Initialize SolidClientWrapper instance
        solid_client = SolidClientWrapper(debug_callback=print)
        print("✅ SolidClientWrapper initialized")
        
        # Get session reference
        session = window.solidClientAuthentication.getDefaultSession()
        
        # Check if this is an OAuth callback (has authorization code)
        current_url = window.location.href
        is_oauth_callback = ('code=' in current_url and 'state=' in current_url)
        
        print(f"🔍 Current URL: {current_url}")
        print(f"🔍 Is OAuth callback: {is_oauth_callback}")
        
        if is_oauth_callback:
            print("🔑 OAuth callback detected - starting session establishment...")
            
            # Process the OAuth redirect
            await session.handleIncomingRedirect(current_url)
            print(f"🔧 Processed redirect for: {current_url}")
            
            # Session establishment with persistence verification
            max_attempts = 15
            timeout_seconds = 30
            max_persistence_failures = 3
            persistence_failures = 0
            
            for attempt in range(max_attempts):
                # Check if we've exceeded timeout
                if attempt * 0.5 > timeout_seconds:
                    print(f"❌ Timeout after {timeout_seconds} seconds")
                    show_error("Authentication timed out. Please try again or clear your browser data.")
                    return
                
                print(f"🔄 Session attempt {attempt + 1}/{max_attempts}")
                await asyncio.sleep(0.5)
                
                # Get fresh session reference
                session = window.solidClientAuthentication.getDefaultSession()
                session_info = session.info if session else None
                
                if session_info and getattr(session_info, 'isLoggedIn', False):
                    webid = getattr(session_info, 'webId', None)
                    
                    # Validate WebID format (security check)
                    if not webid or not webid.strip():
                        print(f"❌ Session has no WebID, retrying...")
                        continue
                    
                    # URL validation for security
                    try:
                        if not (webid.startswith('http://') or webid.startswith('https://')):
                            raise Exception(f"WebID must be a valid URL: {webid}")
                        
                        # Test URL constructor (this was causing errors in logs)
                        test_url = URL.new(webid)
                        print(f"✅ WebID URL validation passed: {webid}")
                    except Exception as url_error:
                        print(f"❌ WebID URL validation failed: {url_error}")
                        print("⚠️ Continuing with potentially invalid WebID")
                    
                    print(f"✅ Session established on attempt {attempt + 1}: {webid}")
                    
                    # Store backup session data with current timestamp
                    current_timestamp = js.Date.now()
                    backup_data = {
                        'webId': webid,
                        'timestamp': current_timestamp,
                        'isLoggedIn': True
                    }
                    
                    try:
                        # FIXED: Use proper JavaScript JSON serialization
                        # Create a plain JavaScript object instead of Python dict
                        js.eval(f'''
                            const backupData = {{
                                webId: "{webid}",
                                timestamp: {current_timestamp},
                                isLoggedIn: true
                            }};
                            const backupJson = JSON.stringify(backupData);
                            localStorage.setItem("{SOLID_SESSION_BACKUP_KEY}", backupJson);
                            console.log("💾 Backup stored:", backupJson);
                        ''')
                        
                        print(f"💾 Backup session data stored with timestamp: {current_timestamp}")
                        print(f"💾 Storage key used: {SOLID_SESSION_BACKUP_KEY}")
                        
                        # Verify storage immediately
                        verification = js.localStorage.getItem(SOLID_SESSION_BACKUP_KEY)
                        if verification:
                            print(f"💾 Storage verification: SUCCESS")
                            print(f"💾 Stored content: {verification}")
                        else:
                            print(f"💾 Storage verification: FAILED - data not found")
                    except Exception as storage_error:
                        print(f"💾 Storage error: {storage_error}")
                        # Fallback: try Python-based storage
                        try:
                            backup_json = f'{{"webId":"{webid}","timestamp":{current_timestamp},"isLoggedIn":true}}'
                            js.localStorage.setItem(SOLID_SESSION_BACKUP_KEY, backup_json)
                            print(f"💾 Fallback storage successful")
                        except Exception as fallback_error:
                            print(f"💾 Fallback storage also failed: {fallback_error}")
                    
                    # Wait for Solid's internal session persistence
                    print("⏳ Waiting for session to persist to storage...")
                    await asyncio.sleep(2)
                    
                    # Verify session persistence
                    session = window.solidClientAuthentication.getDefaultSession()
                    final_session = session.info if session else None
                    
                    if final_session and getattr(final_session, 'isLoggedIn', False):
                        final_webid = getattr(final_session, 'webId', None)
                        print(f"✅ Session persistence verified: {final_webid}")
                        print("🎉 Authentication successful, session persisted")
                        
                        await asyncio.sleep(1)
                        show_success()
                        return
                    else:
                        persistence_failures += 1
                        print(f"❌ Session lost during persistence - failure {persistence_failures}/{max_persistence_failures}")
                        
                        if persistence_failures >= max_persistence_failures:
                            print("❌ Too many persistence failures")
                            show_error("Session persistence is failing. Please try a different browser or clear all browser data.")
                            return
                        
                        print(f"⏳ Retrying session establishment...")
                        continue
                else:
                    session_status = "No session info" if not session_info else f"isLoggedIn={getattr(session_info, 'isLoggedIn', 'unknown')}"
                    print(f"⏳ Attempt {attempt + 1}: Session not ready ({session_status})")
            
            # If we exit the loop without success
            print(f"❌ Failed to establish session after {max_attempts} attempts")
            show_error("Authentication failed after multiple attempts. Please clear browser data and try again.")
            return
        
        else:
            # *** CRITICAL FIX: OAuth initiation code moved INSIDE this else block ***
            # Not an OAuth callback - check if already logged in or start OAuth flow
            session_info = session.info if session else None
            if session_info and getattr(session_info, 'isLoggedIn', False):
                webid = getattr(session_info, 'webId', None)
                print(f"✅ Already logged in! WebID: {webid}")
                show_success()
                return
            
            # Not logged in - start OAuth flow (THIS IS THE KEY FIX!)
            print("🔄 Not authenticated, starting OAuth flow...")
            
            # Parse custom provider from URL parameters
            search_params = window.location.search
            custom_provider = None
            
            if search_params and 'provider=' in search_params:
                # Extract provider URL from query parameters
                provider_start = search_params.find('provider=') + 9
                provider_end = search_params.find('&', provider_start)
                if provider_end == -1:
                    provider_end = len(search_params)
                custom_provider = search_params[provider_start:provider_end]
                
                # URL decode common characters
                custom_provider = custom_provider.replace('%3A', ':').replace('%2F', '/')
                
                # Validate custom provider
                if custom_provider and custom_provider.strip():
                    try:
                        if not (custom_provider.startswith('http://') or custom_provider.startswith('https://')):
                            raise Exception("Custom provider must be a valid HTTP/HTTPS URL")
                        
                        test_url = URL.new(custom_provider.strip())
                        print(f"✅ Custom provider validation passed: {custom_provider}")
                    except Exception as provider_error:
                        print(f"❌ Custom provider validation failed: {provider_error}")
                        show_error(f"Invalid custom provider URL: {provider_error}")
                        return
            
            # *** THIS IS THE CRITICAL CODE THAT WAS MISPLACED ***
            # Start OAuth login flow - now properly inside the else block
            if custom_provider and custom_provider.strip():
                print(f"🔗 Using custom provider: {custom_provider}")
                await solid_client.login(custom_provider.strip())
            else:
                print("🔗 Using default SolidCommunity.net provider")
                await solid_client.login("https://solidcommunity.net")
        
    except Exception as e:
        error_msg = f"Authentication error: {str(e)}"
        print(f"❌ {error_msg}")
        
        # Enhanced error reporting for debugging
        import traceback
        traceback_str = traceback.format_exc()
        print(f"Full traceback:\n{traceback_str}")
        
        show_error(error_msg)