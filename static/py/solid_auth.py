"""
Solid Pod authentication module for Jura platform.
Handles user authentication with Solid Pod providers.
"""
import js


class SolidAuth:
    """Handles Solid Pod authentication and session management."""
    
    def __init__(self, debug_callback=None):
        """
        Initialize the SolidAuth system.
        
        Args:
            debug_callback: Function to call for debug messages
        """
        self.session = js.solidClientAuthentication.getDefaultSession()
        self.debug = debug_callback if debug_callback else print
        self.pod_url = None
        self.debug("SolidAuth initialized")
    
    async def login(self, issuer_url):
        try:
            self.debug(f"Attempting login to {issuer_url}...")
            
            clean_url = js.window.location.origin + js.window.location.pathname
            self.debug(f"Using redirect URL: {clean_url}")
            
            # Request explicit write permissions
            await self.session.login(js.Object.fromEntries([
                ["oidcIssuer", issuer_url],
                ["redirectUrl", clean_url],
                ["clientName", "Jura Cybersecurity Education"],
                # Add permission scopes
                ["scope", "openid profile webid offline_access"],
                ["requestedPermissions", js.JSON.parse('["read", "write", "append", "control"]')]
            ]))
            
            self.debug("Login request sent - redirecting...")
            
        except Exception as e:
            self.debug(f"Login error: {e}")

    async def ensure_directory_exists(self, directory_url):
        """Create directory structure if it doesn't exist"""
        try:
            # Use the authenticated session's fetch
            fetch = self.session.fetch
            
            # Create container using Solid client
            await js.window.solidClient.createContainerAt(
                directory_url,
                js.Object.fromEntries([["fetch", fetch]])
            )
            self.debug(f"✅ Directory ensured: {directory_url}")
            return True
        except Exception as e:
            # Directory might already exist, or we might lack permissions
            self.debug(f"Directory creation result: {e}")
            return False
    
    def check_session(self):
        """
        Check if the user is currently logged in.
        
        Returns:
            bool: True if logged in, False otherwise
        """
        try:
            info = self.session.info
            if info.isLoggedIn:
                self.pod_url = info.webId.split('/profile/card#me')[0] + '/'
                self.debug(f"✅ Already logged in! WebID: {info.webId}")
                self.debug(f"📁 Pod URL: {self.pod_url}")
                return True
            else:
                self.debug("Not logged in")
                return False
        except Exception as e:
            self.debug(f"Session check error: {e}")
            return False
    
    async def save_lesson_progress(self, lesson_id, progress_data):
        """
        Save lesson progress using bundled Solid client library.
        """
        if not self.pod_url:
            self.debug("❌ No pod URL available - user may not be logged in")
            return False
            
        try:
            # Create the data to save
            timestamp = js.Date.new().toISOString()
            save_data = {
                'lesson_id': lesson_id,
                'completed': progress_data.get('completed', False),
                'score': progress_data.get('score', 0),
                'answers': progress_data.get('answers', {}),
                'completed_at': timestamp,
                'app': 'jura-cybersecurity-education'
            }
            
            # Convert to JSON string
            json_data = js.JSON.stringify(save_data)
            
            # File URL in the pod  
            file_url = self.pod_url + f"private/jura-education/lessons/{lesson_id}.json"
            
            self.debug(f"💾 Saving progress to: {file_url}")
            
            # Use the bundled Solid client library
            blob = js.Blob.new([json_data], js.Object.fromEntries([["type", "application/json"]]))
            file = js.File.new([blob], f"{lesson_id}.json", js.Object.fromEntries([["type", "application/json"]]))
            
            # Save using the proper Solid client method
            saved_file = await js.solidClient.saveFileInContainer(
                file_url,
                file,
                js.Object.fromEntries([
                    ["slug", f"{lesson_id}.json"],
                    ["contentType", "application/json"]
                ])
            )
            
            self.debug(f"✅ Progress saved successfully for lesson: {lesson_id}")
            return True
            
        except Exception as e:
            self.debug(f"❌ Error saving progress: {e}")
            import traceback
            self.debug(f"❌ Full error: {traceback.format_exc()}")
            return False
    
    async def load_lesson_progress(self, lesson_id):
        """
        Load lesson progress from the user's Solid Pod.
        
        Args:
            lesson_id (str): Unique lesson identifier
            
        Returns:
            dict: Progress data or None if not found
        """
        if not self.pod_url:
            self.debug("❌ No pod URL available - user may not be logged in")
            return None
            
        try:
            file_url = self.pod_url + f"private/jura-education/lessons/{lesson_id}.json"
            
            self.debug(f"📂 Loading progress from: {file_url}")
            
            # Try to fetch the file
            response = await js.fetch(file_url, js.Object.fromEntries([
                ["headers", js.Object.fromEntries([
                    ["Authorization", f"Bearer {self.session.info.sessionId}"]
                ])]
            ]))
            
            if response.ok:
                json_text = await response.text()
                progress_data = js.JSON.parse(json_text)
                self.debug(f"✅ Progress loaded for lesson: {lesson_id}")
                return progress_data
            else:
                self.debug(f"📝 No saved progress found for lesson: {lesson_id}")
                return None
                
        except Exception as e:
            self.debug(f"❌ Error loading progress: {e}")
            return None
    
    async def logout(self):
        """Log out from the current session."""
        try:
            await self.session.logout()
            self.pod_url = None
            self.debug("Logged out successfully")
        except Exception as e:
            self.debug(f"Logout error: {e}")