"""
Test lesson - super simple proof of concept.
One paragraph + one multiple choice question.
"""

class TestLesson:
    """Simple test lesson for proof of concept."""
    
    def __init__(self):
        self.lesson_id = 'test-lesson'
        self.title = 'Test Lesson'
        self.description = 'A simple test lesson with one paragraph and one question.'
        self.difficulty = 'beginner'
        self.estimated_time = 2
        
        self.content_blocks = [
            {
                'type': 'text',
                'title': 'Welcome to Your First Lesson',
                'content': 'This is a simple test lesson. Cybersecurity is important for everyone, but especially for activists who may face targeted attacks. The most basic security measure is using strong passwords.'
            },
            {
                'type': 'quiz',
                'title': 'Quick Check',
                'question': 'What is the most basic cybersecurity measure mentioned?',
                'options': [
                    'Using antivirus software',
                    'Using strong passwords', 
                    'Avoiding public WiFi',
                    'Using encrypted messaging'
                ],
                'correct_answer': 1,  # Index of correct option (0-based)
                'explanation': 'Strong passwords are the foundation of digital security!'
            }
        ]
        
        self.completed = False
        self.current_block = 0
        self.quiz_answers = {}
        self.score = 0
    
    def get_current_block(self):
        """Get the current content block."""
        if self.current_block < len(self.content_blocks):
            return self.content_blocks[self.current_block]
        return None
    
    def next_block(self):
        """Move to next content block."""
        if self.current_block < len(self.content_blocks) - 1:
            self.current_block += 1
            return True
        return False
    
    def check_answer(self, answer_index):
        """Check if quiz answer is correct."""
        current_block = self.get_current_block()
        if current_block and current_block['type'] == 'quiz':
            correct = answer_index == current_block['correct_answer']
            
            # Store the answer
            self.quiz_answers[self.current_block] = {
                'question': current_block['question'],
                'selected': answer_index,
                'correct': correct
            }
            
            # Update score
            if correct:
                self.score += 10
            
            # Mark as completed if this was the last block
            if self.current_block >= len(self.content_blocks) - 1:
                self.completed = True
            
            return {
                'correct': correct,
                'explanation': current_block['explanation']
            }
        return {'correct': False, 'explanation': 'No quiz question found'}
    
    def get_progress_data(self):
        """Get progress data for saving to Solid Pod."""
        return {
            'completed': self.completed,
            'score': self.score,
            'answers': self.quiz_answers,
            'current_block': self.current_block
        }