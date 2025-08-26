"""
Base lesson class for Jura cybersecurity education.
All lessons inherit from this base class.
"""

class BaseLesson:
    """Base class for all cybersecurity lessons."""
    
    def __init__(self):
        self.lesson_id = None
        self.title = None
        self.description = None
        self.difficulty = None
        self.estimated_time = None
        self.learning_objectives = []
        self.content_blocks = []
        self.completed = False
    
    def get_lesson_data(self):
        """Return lesson data for the frontend."""
        return {
            'lesson_id': self.lesson_id,
            'title': self.title,
            'description': self.description,
            'difficulty': self.difficulty,
            'estimated_time': self.estimated_time,
            'learning_objectives': self.learning_objectives,
            'content_blocks': self.content_blocks,
        }
    
    def render_content_block(self, block_index):
        """Render a specific content block."""
        if block_index < len(self.content_blocks):
            return self.content_blocks[block_index]
        return None
    
    def check_quiz_answer(self, question_index, answer):
        """Check if a quiz answer is correct."""
        # Implement quiz logic
        pass
    
    def mark_completed(self):
        """Mark lesson as completed (save to Solid Pod)."""
        self.completed = True
        # TODO: Save progress to user's Solid Pod