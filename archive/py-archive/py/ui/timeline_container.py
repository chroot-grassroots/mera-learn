"""
Timeline Container - Spatial layout manager for lesson components
Handles the visual timeline structure but NOT component logic/lifecycle
"""

from pyscript import document # type: ignore

class TimelineContainer:
    """Manages the spatial layout of lesson components in a timeline structure"""
    
    def __init__(self, container_id="lesson-container"):
        self.container_id = container_id
        self.timeline_id = f"{container_id}-timeline"
        self.error_slot_id = f"{container_id}-error-slot"
        self._setup_timeline_structure()
    
    def _setup_timeline_structure(self):
        """Create the basic timeline DOM structure"""
        container = document.getElementById(self.container_id)
        if not container:
            raise ValueError(f"Container {self.container_id} not found")
        
        # Clear any existing content
        container.innerHTML = ""
        
        # Create timeline wrapper
        timeline_html = f'''
        <div class="timeline-wrapper max-w-4xl mx-auto">
            <!-- Error slot (hidden by default) -->
            <div id="{self.error_slot_id}" class="hidden mb-6"></div>
            
            <!-- Main timeline -->
            <div id="{self.timeline_id}" class="timeline-track relative">
                <!-- Timeline line -->
                <div class="timeline-line absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300"></div>
                
                <!-- Component slots will be added here -->
            </div>
        </div>
        '''
        container.innerHTML = timeline_html
    
    def add_component_slot(self, component_id, position="bottom"):
        """Add a spatial slot for a component - matches learn.html card styling"""
        timeline = document.getElementById(self.timeline_id)
        if not timeline:
            return False
        
        slot_html = f'''
        <div id="slot-{component_id}" class="timeline-item relative flex items-start">
            <!-- Timeline dot -->
            <div class="timeline-dot relative z-10 flex items-center justify-center w-4 h-4 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-full mt-6">
                <div class="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
            </div>
            
            <!-- Component content area - matches learn.html card styling -->
            <div id="component-{component_id}" class="component-content ml-6 flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                <!-- Core will inject component here -->
                <div class="loading-placeholder text-center py-4">
                    <div class="flex items-center justify-center space-x-2 text-blue-600 dark:text-blue-400">
                        <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span class="text-sm font-medium">Loading component...</span>
                    </div>
                </div>
            </div>
        </div>
        '''
        
        if position == "bottom":
            timeline.insertAdjacentHTML('beforeend', slot_html)
        else:
            timeline.insertAdjacentHTML('afterbegin', slot_html)
        
        return True
    
    def get_component_area(self, component_id):
        """Get the DOM element where core should inject the component"""
        return document.getElementById(f"component-{component_id}")
    
    def remove_component_slot(self, component_id):
        """Remove a component slot from the timeline"""
        slot = document.getElementById(f"slot-{component_id}")
        if slot:
            slot.remove()
            return True
        return False
    
    def update_component_status(self, component_id, status="active"):
        """Update visual state of a component slot (completed, active, locked)"""
        slot = document.getElementById(f"slot-{component_id}")
        if not slot:
            return False
        
        dot = slot.querySelector('.timeline-dot div')
        if not dot:
            return False
        
        # Reset classes
        dot.className = "w-2 h-2 rounded-full"
        
        # Apply status styling
        if status == "completed":
            dot.className += " bg-green-500"
            slot.querySelector('.timeline-dot').className = slot.querySelector('.timeline-dot').className.replace('border-blue-500', 'border-green-500')
        elif status == "active":
            dot.className += " bg-blue-500"
            slot.querySelector('.timeline-dot').className = slot.querySelector('.timeline-dot').className.replace('border-green-500', 'border-blue-500')
        elif status == "locked":
            dot.className += " bg-gray-400"
            slot.querySelector('.timeline-dot').className = slot.querySelector('.timeline-dot').className.replace('border-blue-500 border-green-500', 'border-gray-400')
        
        return True
    
    def get_error_slot(self):
        """Get the error display area for the error handler"""
        return document.getElementById(self.error_slot_id)
    
    def clear_timeline(self):
        """Remove all component slots"""
        timeline = document.getElementById(self.timeline_id)
        if timeline:
            # Keep the timeline line, remove component slots
            slots = timeline.querySelectorAll('.timeline-item')
            for slot in slots:
                slot.remove()
    
    def set_timeline_progress(self, completed_count, total_count):
        """Update the timeline line to show overall progress"""
        if total_count == 0:
            return
        
        progress_percent = (completed_count / total_count) * 100
        timeline = document.getElementById(self.timeline_id)
        if not timeline:
            return
        
        # Update timeline line with progress indicator
        timeline_line = timeline.querySelector('.timeline-line')
        if timeline_line:
            timeline_line.innerHTML = f'''
            <div class="progress-fill absolute top-0 left-0 w-full bg-green-400" 
                 style="height: {progress_percent}%; transition: height 0.3s ease;"></div>
            '''