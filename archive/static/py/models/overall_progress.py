"""
Lesson Progress Model - Pre-Alpha v0.0.1
Mera Cybersecurity Education Platform

Pydantic model for tracking individual lesson completion status.
This model handles the basic lesson progress tracking for the initial
5 lessons in the cybersecurity curriculum.

Schema Version: 0.0.1
Status: Pre-Alpha - Subject to breaking changes
"""

from pydantic import BaseModel, Field, validator
from typing import Dict


class LessonProgressModel(BaseModel):
    """
    Tracks completion status for individual lessons and weekly progress.
    
    This model represents the lesson_progress.json file structure
    for storing user progress through the lesson curriculum.
    """
    
    # Schema versioning for data migration support
    schema_version: str = Field(
        default="0.0.1",
        description="Schema version for data migration compatibility"
    )
    
    # Individual lesson completion tracking
    lesson_1_complete: bool = Field(
        default=False,
        description="Completion status for Lesson 1"
    )
    
    lesson_2_complete: bool = Field(
        default=False,
        description="Completion status for Lesson 2"
    )
    
    lesson_3_complete: bool = Field(
        default=False,
        description="Completion status for Lesson 3"
    )
    
    lesson_4_complete: bool = Field(
        default=False,
        description="Completion status for Lesson 4"
    )
    
    lesson_5_complete: bool = Field(
        default=False,
        description="Completion status for Lesson 5"
    )
    
    # Weekly progress tracking
    lessons_completed_this_week: int = Field(
        default=0,
        ge=0,  # Greater than or equal to 0
        le=5,  # Less than or equal to 5
        description="Number of lessons completed in the current week (0-5)"
    )
    
    @validator('schema_version')
    def validate_schema_version(cls, v):
        """Ensure schema version follows expected format."""
        if v != "0.0.1":
            raise ValueError("Unsupported schema version")
        return v
    
    def get_total_completed(self) -> int:
        """
        Calculate total number of lessons completed.
        
        Returns:
            int: Total count of completed lessons (0-5)
        """
        completed_lessons = [
            self.lesson_1_complete,
            self.lesson_2_complete,
            self.lesson_3_complete,
            self.lesson_4_complete,
            self.lesson_5_complete
        ]
        return sum(completed_lessons)
    
    def is_lesson_complete(self, lesson_number: int) -> bool:
        """
        Check if a specific lesson is completed.
        
        Args:
            lesson_number (int): Lesson number (1-5)
            
        Returns:
            bool: True if lesson is completed
            
        Raises:
            ValueError: If lesson_number is not in range 1-5
        """
        if lesson_number < 1 or lesson_number > 5:
            raise ValueError("Lesson number must be between 1 and 5")
        
        lesson_map = {
            1: self.lesson_1_complete,
            2: self.lesson_2_complete,
            3: self.lesson_3_complete,
            4: self.lesson_4_complete,
            5: self.lesson_5_complete
        }
        
        return lesson_map[lesson_number]
    
    def mark_lesson_complete(self, lesson_number: int) -> None:
        """
        Mark a specific lesson as completed.
        
        Args:
            lesson_number (int): Lesson number (1-5)
            
        Raises:
            ValueError: If lesson_number is not in range 1-5
        """
        if lesson_number < 1 or lesson_number > 5:
            raise ValueError("Lesson number must be between 1 and 5")
        
        if lesson_number == 1:
            self.lesson_1_complete = True
        elif lesson_number == 2:
            self.lesson_2_complete = True
        elif lesson_number == 3:
            self.lesson_3_complete = True
        elif lesson_number == 4:
            self.lesson_4_complete = True
        elif lesson_number == 5:
            self.lesson_5_complete = True


# Example usage and testing
if __name__ == "__main__":
    # Create default lesson progress
    progress = LessonProgressModel()
    
    # Demonstrate functionality
    print(f"Total completed: {progress.get_total_completed()}")
    print(f"Lesson 1 complete: {progress.is_lesson_complete(1)}")
    
    # Mark lesson as complete
    progress.mark_lesson_complete(1)
    progress.lessons_completed_this_week = 1
    
    print(f"After completing lesson 1:")
    print(f"Total completed: {progress.get_total_completed()}")
    print(f"This week: {progress.lessons_completed_this_week}")