"""
Solid Pod authentication module for Mera platform.
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
        """
        Login to a Solid Pod provider with explicit write permissions.
        
        Args:
            issuer_url (str): URL of the Solid Pod provider
        """
        try:
            self.debug(f"Attempting login to {issuer_url}...")
            
            clean_url = js.window.location.origin + js.window.location.pathname
            self.debug(f"Using redirect URL: {clean_url}")
            
            # Request explicit write permissions for private data
            await self.session.login(js.Object.fromEntries([
                ["oidcIssuer", issuer_url],
                ["redirectUrl", clean_url],
                ["clientName", "Mera Cybersecurity Education"],
                # Request broader permissions
                ["scope", "openid profile webid offline_access"]
            ]))
            
            self.debug("Login request sent - redirecting...")
            
        except Exception as e:
            self.debug(f"Login error: {e}")

    async def ensure_directory_exists(self, directory_url):
        """
        Create directory structure if it doesn't exist.
        
        Args:
            directory_url (str): URL of the directory to create
            
        Returns:
            bool: True if directory exists or was created successfully
        """
        try:
            # Use the authenticated session's fetch
            await js.window.solidClient.createContainerAt(
                directory_url,
                js.Object.fromEntries([["fetch", self.session.fetch]])
            )
            self.debug(f"✅ Directory ensured: {directory_url}")
            return True
        except Exception as e:
            # Check if it's just a "directory already exists" error
            error_str = str(e)
            if "409" in error_str or "Conflict" in error_str:
                self.debug(f"✅ Directory already exists: {directory_url}")
                return True
            else:
                self.debug(f"Directory creation error: {e}")
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
        Save lesson progress to the user's Solid Pod.
        
        Args:
            lesson_id (str): Unique lesson identifier
            progress_data (dict): Progress data to save
            
        Returns:
            bool: True if saved successfully, False otherwise
        """
        if not self.pod_url:
            self.debug("❌ No pod URL available - user may not be logged in")
            return False
            
        try:
            # Ensure directory structure exists
            container_url = f"{self.pod_url}private/mera-education/lessons/"
            await self.ensure_directory_exists(container_url)
            
            # Create the full file URL
            file_url = f"{container_url}{lesson_id}.json"
            self.debug(f"💾 Saving progress to: {file_url}")
            
            # Convert progress data to JSON string
            json_data = js.JSON.stringify(progress_data)
            
            # Create a blob with the JSON data
            file_blob = js.Blob.new([json_data], js.Object.fromEntries([
                ["type", "application/json"]
            ]))
            
            # Use overwriteFile instead of saveFileInContainer
            saved_file = await js.window.solidClient.overwriteFile(
                file_url,
                file_blob,
                js.Object.fromEntries([
                    ["fetch", self.session.fetch],
                    ["contentType", "application/json"]
                ])
            )
            
            self.debug("✅ Progress saved successfully!")
            return True
            
        except Exception as e:
            self.debug(f"❌ Error saving progress: {e}")
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
            file_url = f"{self.pod_url}private/mera-education/lessons/{lesson_id}.json"
            self.debug(f"📂 Loading progress from: {file_url}")
            
            # Use Solid client with authenticated fetch
            file_data = await js.window.solidClient.getFile(
                file_url,
                js.Object.fromEntries([["fetch", self.session.fetch]])
            )
            
            # Convert blob to text and parse JSON
            json_text = await file_data.text()
            progress_data = js.JSON.parse(json_text)
            
            self.debug(f"✅ Progress loaded for lesson: {lesson_id}")
            return progress_data
            
        except Exception as e:
            self.debug(f"📝 No saved progress found for lesson: {lesson_id} ({e})")
            return None
    
    async def debug_permissions(self):
        """Debug current session permissions and capabilities."""
        try:
            info = self.session.info
            self.debug("🔍 Permission Debug:")
            self.debug(f"  - Logged in: {info.isLoggedIn}")
            self.debug(f"  - WebID: {info.webId}")
            
            # Test if we can create a simple private file
            test_url = f"{self.pod_url}private/mera-test-permissions.txt"
            
            try:
                test_blob = js.Blob.new(["test"], js.Object.fromEntries([
                    ["type", "text/plain"]
                ]))
                
                await js.window.solidClient.overwriteFile(
                    test_url,
                    test_blob,
                    js.Object.fromEntries([
                        ["fetch", self.session.fetch],
                        ["contentType", "text/plain"]
                    ])
                )
                self.debug("  - ✅ Private write permissions: WORKING")
                
                # Clean up test file
                try:
                    await js.window.solidClient.deleteFile(
                        test_url, 
                        js.Object.fromEntries([["fetch", self.session.fetch]])
                    )
                except:
                    pass  # Don't fail if cleanup fails
                    
            except Exception as e:
                self.debug(f"  - ❌ Private write permissions: FAILED ({e})")
                
        except Exception as e:
            self.debug(f"Permission debug error: {e}")
    
    async def logout(self):
        """Log out from the current session."""
        try:
            await self.session.logout()
            self.pod_url = None
            self.debug("Logged out successfully")
        except Exception as e:
            self.debug(f"Logout error: {e}")