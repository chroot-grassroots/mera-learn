import js
from pyscript import document

class NavigationController:
    def __init__(self):
        self.setup_mobile_menu()
        self.setup_learning_links()
    
    def setup_mobile_menu(self):
        """Set up mobile menu toggle functionality"""
        menu_toggle = document.getElementById("mobile-menu-toggle")
        if menu_toggle:
            menu_toggle.onclick = self.toggle_mobile_menu
    
    def toggle_mobile_menu(self, event=None):
        """Toggle mobile menu visibility and hamburger icon"""
        mobile_menu = document.getElementById("mobile-menu")
        hamburger_icon = document.getElementById("hamburger-icon") 
        close_icon = document.getElementById("close-icon")
        
        if mobile_menu and hamburger_icon and close_icon:
            is_hidden = "hidden" in mobile_menu.classList
            
            if is_hidden:
                mobile_menu.classList.remove("hidden")
                hamburger_icon.classList.add("hidden")
                close_icon.classList.remove("hidden")
            else:
                mobile_menu.classList.add("hidden")
                hamburger_icon.classList.remove("hidden")
                close_icon.classList.add("hidden")
    
    async def setup_learning_links(self):
        """Update learning link text based on Solid authentication"""
        try:
            if hasattr(js.window, 'solidClientAuthentication'):
                session = js.window.solidClientAuthentication.getDefaultSession()
                text = "Back to Learning" if session.info.isLoggedIn else "Start Learning"
                href = "/learn/" if session.info.isLoggedIn else "/hello/"
                
                for link_selector in ["a[href*='learn']", "#mobile-learning-link"]:
                    link = document.querySelector(link_selector)
                    if link:
                        link.textContent = text
                        link.href = href
        except Exception as e:
            pass  # Silent fallback

# Initialize navigation
nav_controller = NavigationController()