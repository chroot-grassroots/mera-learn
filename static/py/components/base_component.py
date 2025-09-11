# base_component.py
from pydantic import BaseModel, Field, PrivateAttr, field_validator
from typing import List, Optional, Union, Any
from abc import ABC, abstractmethod

def TrumpField(default: Any, trump: str):
    """Custom field with trump strategy for merge conflicts"""
    field = Field(default)
    field.field_info.extra["trump"] = trump
    return field

class BaseComponentConfig(BaseModel, ABC):
    # This class CANNOT be instantiated directly
    id: int = Field(..., ge=0, le=999999999999) #Immutable ID used to track components as they move for progress purposes
    type: str = Field(...) #Text, multiple choice question, task, etc.
    accessibility_label: str = Field(..., min_length=3) #Description for screen reader
    order: int = Field(...) #Components on a lesson go from least to greatest. Start with 100, 200, 300, .., to give room.

    @field_validator('type')
    @abstractmethod
    def validate_type_matches_class(cls, v):
        """Each child must implement type validation"""

class BaseComponentProgress(BaseModel, ABC):
    # This class CANNOT be instantiated directly
    complete: bool = TrumpField(..., trump="true_wins")

    # Every child must implement these for every field they add
    @field_validator('complete', mode='before')
    @abstractmethod 
    def set_complete_default(cls, v):
        """Each child must implement default logic for complete"""
        pass
        
    # Future: force this pattern for ANY field they add
    @abstractmethod
    def get_all_trump_strategies(self) -> dict:
        """Return trump strategy for every field in this component"""
        pass
    
    @abstractmethod  
    def get_all_defaults(self) -> dict:
        """Return default values for every field in this component"""
        pass

class BaseComponentInternal(BaseModel, ABC):
    """Internal state that is never serialized or shared with core"""
    rendered: bool = False
    
    @field_validator('rendered', mode='before')
    @abstractmethod 
    def set_rendered_default(cls, v):
        """Each child must implement default logic for rendered"""
        pass  # Should return v or default
    
    # Future: force this pattern for ANY field they add
    @abstractmethod  
    def get_all_defaults(self) -> dict:
        """Return default values for every field in this component"""
        pass