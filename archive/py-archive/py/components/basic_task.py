# basic_task.py
from typing import List, Annotated
from pydantic import Field, validator, StringConstraints, BaseModel
from static.py.components.base_component import BaseComponent, BaseComponentConfig, BaseComponentInternal, BaseComponentProgress
from itertools import zip_longest

class CheckboxItem(BaseModel):
    content: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    required: bool = False  # Default to optional

class BasicTaskComponentConfig(BaseComponentConfig):
    # Inherit all fields from BaseComponentConfig (id, type, accessibility_label, order)
    # Add task-specific fields:
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=1000)  
    checkboxes: List[CheckboxItem] = Field(..., min_items=1, max_items=10)
    
    @validator('type')
    def validate_type_matches_class(cls, v):
        if v != "basic_task":
            raise ValueError("BasicTaskComponentConfig type must be 'basic_task'")
        return v

class BasicTaskComponentProgress(BaseComponentProgress):
    checkbox_checked: List[bool] = Field(default_factory=list)

    def set_checkbox_state(self, config, index: int, checked: bool):
        """Set individual checkbox state with validation"""
        if index >= len(config.checkboxes):
            raise ValueError(f"Checkbox index {index} out of range")
        
        if len(self.checkbox_checked) != len(config.checkboxes):
            raise ValueError(f"Progress has {len(self.checkbox_checked)} checkboxes, config expects {len(config.checkboxes)}")
        
        self.checkbox_checked[index] = checked
    
    def reset_checkboxes(self, config):
        """Reset all checkboxes to unchecked"""
        self.checkbox_checked = [False] * len(config.checkboxes)
    
    def create_fields_for_config(self, config) -> dict:
        """Create all fields with proper initial values for this config"""
        return {
            "checkbox_checked": [False] * len(config.checkboxes)
        }
    
    def get_all_trump_strategies(self) -> dict:
        """Return trump strategy for every field in this component"""
        return {
            "checkbox_checked": lambda a, b: [x or y for x, y in zip_longest(a, b, fillvalue=False)]
        }

class BasicTaskComponentInternal(BaseComponentInternal):
    rendered: bool = False

class BasicTaskComponent(BaseComponent):
    def is_complete(self) -> bool:
        """Check if all required checkboxes are checked"""
        for i, checkbox_item in enumerate(self.config.checkboxes):
            if checkbox_item.required:
                if i >= len(self.progress.checkbox_checked) or not self.progress.checkbox_checked[i]:
                    return False
        return True
    
    def _create_internal_model(self):
        return BasicTaskComponentInternal()
    
    def _render(self):
        if not self.internal.rendered:
            # Build DOM here
            self.internal.rendered = True