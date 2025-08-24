import js

class SolidAuth:
    def __init__(self, debug_callback=None):
        self.session = js.solidClientAuthentication.getDefaultSession()
        self.debug = debug_callback or print
        self.debug("SolidAuth initialized")
    
    async def login(self, issuer_url):
        try:
            self.debug(f"Attempting login to {issuer_url}...")
            
            clean_url = js.window.location.origin + js.window.location.pathname
            self.debug(f"Using redirect URL: {clean_url}")
            
            await self.session.login(js.Object.fromEntries([
                ["oidcIssuer", issuer_url],
                ["redirectUrl", clean_url],
                ["clientName", "Jura Cybersecurity Education"]
            ]))
            
            self.debug("Login request sent - redirecting...")
            
        except Exception as e:
            self.debug(f"Login error: {e}")
    
    def check_session(self):
        try:
            info = self.session.info
            if info.isLoggedIn:
                self.debug(f"✅ Already logged in! WebID: {info.webId}")
                return True
            else:
                self.debug("Not logged in")
                return False
        except Exception as e:
            self.debug(f"Session check error: {e}")
            return False
    
    async def logout(self):
        try:
            await self.session.logout()
            self.debug("Logged out successfully")
        except Exception as e:
            self.debug(f"Logout error: {e}")