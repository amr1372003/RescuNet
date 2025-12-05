"""
File models.py
Author Youssef Elebiary
Brief Data Models for RescuNet
Version 1.0
Date 2025-11-25
Copyright (c) 2025
"""

# ========== IMPORTING LIBRARIES ========== #
from enum import Enum
from typing import (
    Optional,
    List,
    Dict,
)
from pydantic import (
    BaseModel,
    Field,
    model_validator,
)
########################



# ========== DATA MODELS ========== #
class Bbox(BaseModel):
    north: float = Field(..., ge=-90, le=90, description="Latitude between -90 and 90")
    south: float = Field(..., ge=-90, le=90, description="Latitude between -90 and 90")
    east: float = Field(..., ge=-180, le=180, description="Longitude between -180 and 180")
    west: float = Field(..., ge=-180, le=180, description="Longitude between -180 and 180")

class NodeType(str, Enum):
    SURVIVOR = "survivor"
    PICKUP = "pickup"

class MapData(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="Latitude between -90 and 90")
    lon: float = Field(..., ge=-180, le=180, description="Longitude between -180 and 180")

class NodeData(BaseModel):
    id: int
    x: float
    y: float
    type: NodeType
    urgency: Optional[int] = None
    count: Optional[int] = None

    @model_validator(mode='after')
    def validate_data(self):
        if self.type == NodeType.SURVIVOR:
            if self.urgency is None or self.count is None:
                raise ValueError("Survivor nodes require 'urgency' and 'count'")
        return self

class EdgeModification(BaseModel):
    u: int
    v: int
    key: int = 0
    state: str

class RouteRequest(BaseModel):
    graph_uuid: Optional[str] = None
    nodes: List[NodeData]
    modified_edges: List[EdgeModification]
    start_location: Dict[str, float]
    bbox: Bbox

class Data(BaseModel):
    mapData: MapData
    nodes: List[NodeData]
########################