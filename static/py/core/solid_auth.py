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
    
    async def logout(self):
        """Log out from the current session."""
        try:
            await self.session.logout()
            self.pod_url = None
            self.debug("Logged out successfully")
        except Exception as e:
            self.debug(f"Logout error: {e}")