# base_component.py
from pydantic import BaseModel, Field, PrivateAttr, validator
from typing import List, Optional, Union, Any
from abc import ABC, abstractmethod

from static.py.models.delete_me_later import ComponentProgressMessage, NavigationProgressMessage, OverallProgressMessage, SettingProgressMessage

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

    @validator('type')
    @abstractmethod
    def validate_type_matches_class(cls, v):
        """Each child must implement type validation"""
        pass

class BaseComponentProgress(BaseModel, ABC):
    
    # Core lifecycle methods
    @abstractmethod
    def create_fields_for_config(self, config) -> dict:
        """Create all fields with proper initial values for this config"""
        pass

    # Merge strategy
    @abstractmethod
    def get_all_trump_strategies(self) -> dict:
        """Return trump strategy for every field in this component"""
        pass

class BaseComponentInternal(BaseModel, ABC):
    """Internal state that is never serialized or shared with core"""
    pass

class BaseComponent (ABC):
    def __init__(self, config: BaseComponentConfig, progress: BaseComponentProgress, timeline):
        self.config = config
        self.progress = progress
        self.timeline = timeline
        self.internal = self._create_internal_model()  # Must be implemented
        
        # Component creates its own slot and renders
        # TO DO add logic that interacts with timeline
        pass

    @abstractmethod
    def is_complete(self) -> bool:
        """Each component must implement this to let the navigator know if it is ready to move on"""
        pass

    @abstractmethod
    def _create_internal_model(self):
        """Each component must implement this to return its internal model instance"""
        pass
    
    def _render(self):
        # Build initial DOM in assigned container
        pass
        
    def get_component_progress_messages(self) -> List[ComponentProgressMessage]:
        # Core polling interface - return and clear message queue
        return []  # TODO: implement message queue

    def get_overall_progress_messages(self) -> List[OverallProgressMessage]:
        # Core polling interface - return and clear message queue
        return []  # TODO: implement message queue

    def get_navigation_messages(self) -> List[NavigationProgressMessage]:
        # Core polling interface - return and clear message queue
        return []  # TODO: implement message queue

    def get_setting_messages(self) -> List[SettingProgressMessage]:
        # Core polling interface - return and clear message queue
        return []  # TODO: implement message queue

    def destroy(self):
        if hasattr(self, 'timeline'):
            self.timeline.remove_component_slot(self.config.id)