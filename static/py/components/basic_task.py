# basic_task.py
from typing import List
from pydantic import Field, field_validator
from static.py.components.base_component import BaseComponentConfig

class TaskComponentConfig(BaseComponentConfig):
    # Inherit all fields from BaseComponentConfig (id, type, accessibility_label, order)
    # Add task-specific fields:
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=1000)  
    checkboxes: List[str] = Field(..., min_items=1, max_items=10)
    required_checkboxes: int = Field(default=1, ge=1)  # How many must be checked to complete
    
    @field_validator('type')
    def validate_type_matches_class(cls, v):
        if v != "task":
            raise ValueError("TaskComponentConfig type must be 'task'")
        return v
    
    @field_validator('required_checkboxes') 
    def validate_required_count(cls, v, info):
        # Make sure required_checkboxes doesn't exceed total checkboxes
        if 'checkboxes' in info.data and len(info.data['checkboxes']) < v:
            raise ValueError("required_checkboxes cannot exceed number of checkboxes")
        return v