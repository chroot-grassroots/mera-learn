"""
Lesson loader for managing lessons.
"""

# Global lesson instance
current_lesson = None

def load_test_lesson():
    """Load the test lesson."""
    global current_lesson
    current_lesson = TestLesson()
    return current_lesson

def get_current_lesson():
    """Get the currently loaded lesson."""
    return current_lesson