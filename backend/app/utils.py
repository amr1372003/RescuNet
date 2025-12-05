"""
File utils.py
Author Youssef Elebiary
Brief Utility functions for graph operations in RescuNet
Version 1.0
Date 2025-11-25
Copyright (c) 2025
"""

# ========== IMPORTING LIBRARIES ========== #
from time import time
from typing import (
    List,
    Tuple,
    Dict,
    Union,
    Optional,
    Any,
)
from math import (
    sin,
    cos,
    sqrt,
    atan2,
    radians,
)

from geopandas import GeoDataFrame
from osmnx import (
    graph_from_point as graph,
    graph_from_bbox as graph_bbox,
    graph_to_gdfs,
    nearest_edges,
)

from networkx import (
    MultiDiGraph,
    MultiGraph,
    NetworkXError,
    set_edge_attributes,
)
from shapely.geometry import (
    Point,
    LineString,
)
from shapely.ops import substring

from .models import (
    NodeData,
    EdgeModification
)
########################



# ========== GRAPH LOADING & EXPORT ========== #
def download_graph(lat: float, lon: float) -> MultiDiGraph:
    """Downloads a driving graph with 1250m radius from given lat/lon coordinates

    Args:
        lat (float): Latitude of the middle of the graph
        lon (float): Longitude of the middle of the graph


    Returns:
        MultiDiGraph: The graph object
    """
    try:
        G: MultiDiGraph = graph((lat, lon), dist=1250, network_type="drive")
    except ValueError as e:
        raise NetworkXError(str(e))
    return G

def download_graph_bbox(north: float, south: float, east: float, west: float) -> MultiDiGraph:
    """Downloads a driving graph bounding by the 4 coordinates

    Args:
        north (float): The north boundary
        south (float): The south boundary
        east (float): The east boundary
        west (float): The west boundary

    Returns:
        MultiDiGraph: The graph object
    """
    try:
        G: MultiDiGraph = graph_bbox((west, south, east, north), network_type="drive")
    except ValueError as e:
        raise NetworkXError(str(e))
    return G

def graph_to_json(G: MultiDiGraph) -> str:
    """Converts graph to GeoJSON format for frontend visualization

    Args:
        G (MultiDiGraph): The graph to convert

    Returns:
        str: JSON string containing graph edges and properties
    """
    gdf_edges: GeoDataFrame = graph_to_gdfs(G, nodes=False).reset_index()
    rename_map: Dict[str, str] = {}
    cols = gdf_edges.columns

    if 'u' not in cols and 'level_0' in cols:
        rename_map['level_0'] = 'u'
    if 'v' not in cols and 'level_1' in cols:
        rename_map['level_1'] = 'v'
    if 'key' not in cols and 'level_2' in cols:
        rename_map['level_2'] = 'key'

    if rename_map:
        gdf_edges = gdf_edges.rename(columns=rename_map)

    return gdf_edges.to_json()
########################



# ========== GRAPH MODIFICATION ========== #
def edit_edges(G: Union[MultiDiGraph, MultiGraph], edges: List[EdgeModification]) -> Union[MultiDiGraph, MultiGraph]:
    """Updates edge states (clear/blocked/partial) in the graph

       Handles bidirectional updates for road closures - if one direction is blocked,
       the opposite direction is also updated to maintain consistency.

    Args:
        G (MultiDiGraph): Graph to modify
        edges (List[EdgeModification]): List of edge state changes to apply

    Returns:
        MultiDiGraph: Modified graph with updated edge states
    """
    for edge in edges:
        if G.has_edge(edge.u, edge.v, key=edge.key):
            set_edge_attributes(G, {(edge.u, edge.v, edge.key): {"state": edge.state}})

        if G.has_edge(edge.v, edge.u):
            for k in G[edge.v][edge.u]:
                set_edge_attributes(G, {(edge.v, edge.u, k): {"state": edge.state}})

    return G

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two geographic points

    Args:
        lat1 (float): Latitude of first point
        lon1 (float): Longitude of first point
        lat2 (float): Latitude of second point
        lon2 (float): Longitude of second point

    Returns:
        float: Distance in meters between the two points
    """
    R: int = 6371000  # Earth radius in meters
    phi1: float = radians(lat1)
    phi2: float = radians(lat2)
    dphi: float = radians(lat2 - lat1)
    dlambda: float = radians(lon2 - lon1)
    a: float = sin(dphi/2)**2 + cos(phi1)*cos(phi2)*sin(dlambda/2)**2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))

def split_edge_at_point(G: Union[MultiDiGraph, MultiGraph], u: int, v: int, key: str, point_coords: Tuple[float, float]) -> Optional[int]:
    """Splits a graph edge at specified coordinates and inserts new node

       ALGORITHM:
       1. Validates edge existence and retrieves geometry
       2. Ensures geometry direction matches u->v edge direction
       3. Projects point onto line geometry to find split location
       4. Creates new node at interpolated position
       5. Splits original geometry into two segments preserving curvature
       6. Adds new edges with recalculated lengths
       7. Removes original edge

    Args:
        G (MutliDiGraph): The graph to modify
        u (int): Starting node ID of the edge
        v (int): Ending node ID of the edge
        key (str): The key
        point_coords (Tuple[float, float]): The coordinates of the point to split at

    Returns:
        int: The ID of the new node
    """

    # Check if the edge exists in the graph
    if not G.has_edge(u, v, key):
        return None

    data: Dict[str, Any] = G[u][v][key]
    
    # Get Geometry or create straight line if missing
    if 'geometry' in data:
        line = data['geometry']
    else:
        # Create straight line between nodes if no geometry data exists
        line = LineString([(G.nodes[u]['x'], G.nodes[u]['y']), (G.nodes[v]['x'], G.nodes[v]['y'])])
    
    # Ensure Geometry aligns with u->v direction before splitting
    u_x, u_y = G.nodes[u]['x'], G.nodes[u]['y']
    start_x, start_y = line.coords[0]

    # Calculate squared distance from u to line start and end points
    dist_start = (u_x - start_x)**2 + (u_y - start_y)**2
    end_x, end_y = line.coords[-1]
    dist_end = (u_x - end_x)**2 + (u_y - end_y)**2

    # If line end is closer to u than line start, geometry is reversed
    if dist_end < dist_start:
        # The geometry is reversed relative to u->v. Reverse it for splitting.
        line = LineString(list(line.coords)[::-1])
    
    # Project point onto the line geometry
    p = Point(point_coords)
    dist_along = line.project(p) # Distance from start of line
    
    # Create New Node with unique negative ID to avoid conflicts
    new_node_id = hash(f"{u}-{v}-{key}-{time()}") % 10000000 * -1
    new_point = line.interpolate(dist_along)
    G.add_node(new_node_id, x=new_point.x, y=new_point.y)
    
    # Split Geometry Preserving Curvature using substring
    geom_u_new = substring(line, 0, dist_along)
    geom_new_v = substring(line, dist_along, line.length)
    
    # Add new edges with updated geometry and recalculated lengths
    len_1 = haversine_distance(G.nodes[u]['y'], G.nodes[u]['x'], new_point.y, new_point.x)
    attr1 = data.copy()
    attr1.update({'length': len_1, 'geometry': geom_u_new})
    G.add_edge(u, new_node_id, key=0, **attr1)
    
    len_2 = haversine_distance(new_point.y, new_point.x, G.nodes[v]['y'], G.nodes[v]['x'])
    attr2 = data.copy()
    attr2.update({'length': len_2, 'geometry': geom_new_v})
    G.add_edge(new_node_id, v, key=0, **attr2)
    
    # Remove original edge since it has been split
    G.remove_edge(u, v, key)
    return new_node_id
########################



# ========== NODE PROCESSING & INTEGRATION ========== #
def deduplicate_nodes(nodes: List[NodeData]) -> List[NodeData]:
    """Removes duplicate nodes within 10m tolerance and merges their properties
        
       Merges urgency (takes maximum) and counts (sums) for duplicate nodes to
       prevent multiple splits at nearly identical locations.

    Args:
        nodes (List[NodeData]): List of node data to deduplicate

    Returns:
        List[NodeData]: Deduplicated list with merged properties
    """
    unique_nodes = []
    for node in nodes:
        is_duplicate = False
        for existing in unique_nodes:
            dist = haversine_distance(node.y, node.x, existing.y, existing.x)
            if dist < 10.0: # 10 meters tolerance
                # Merge logic: Keep the existing one, maybe update urgency/count?
                # For now, just skipping is enough to prevent double-split.
                # Or update max urgency
                existing.urgency = max(existing.urgency, node.urgency if node.urgency is not None else 0.0)
                existing.count += node.count
                is_duplicate = True
                break
        if not is_duplicate:
            unique_nodes.append(node)
    return unique_nodes

def integrate_nodes_into_graph(G: Union[MultiDiGraph, MultiGraph], nodes: List[NodeData]) \
    -> Tuple[Union[MultiDiGraph, MultiGraph], List[Dict[str, Any]]]:
    """Intelligently integrates survivor nodes into the road network graph

    Args:
        G (MultiDiGraph): Graph to modify
        nodes (List[NodeData]): Survivor nodes to integrate

    Returns:
        Tuple[MultiDiGraph, List[NodeData]]: (Modified graph, List of snapped node mappings)
    """
    snapped_nodes = []
    # Convert to undirected graph for nearest edge search
    # This ensures we find the closest road segment regardless of directionality
    G_undir = G.to_undirected()
    
    # Process each survivor node for integration into the road network
    for node_req in nodes:
        # Find the nearest edge to the survivor's location
        u, v, key = nearest_edges(G_undir, node_req.x, node_req.y)
        
        # Get Edge Data to check state
        edge_data = G.get_edge_data(u, v, key) or G.get_edge_data(v, u, key)

        # Default to clear if not found or if key mismatch
        # If not found by exact key, grab *any* key between u,v
        if not edge_data:
            if G.has_edge(u, v): edge_data = G[u][v][list(G[u][v].keys())[0]]
            elif G.has_edge(v, u): edge_data = G[v][u][list(G[v][u].keys())[0]]
            else: edge_data = {'state': 'clear'}    # Default assumption if edge not found
            
        state = edge_data.get('state', 'clear')

        # Calculate distances to both endpoints of the nearest edge
        node_u = G.nodes[u]
        node_v = G.nodes[v]
        dist_u: float = haversine_distance(node_req.y, node_req.x, node_u['y'], node_u['x'])
        dist_v: float = haversine_distance(node_req.y, node_req.x, node_v['y'], node_v['x'])
        
        final_node_id = None
        
        # Priority 1: Snap to existing intersection if close within 50 meters
        if dist_u < 50.0: 
            final_node_id = u
        elif dist_v < 50.0: 
            final_node_id = v
        elif state == 'blocked':
            # Priority 2: Blocked Edge Handling
            # If the road is blocked, we CANNOT split it
            # We must snap to the reachable end.
            if dist_u < dist_v:
                final_node_id = u
            else:
                final_node_id = v
        else:
            # Priority 3: Split the edge (Clear/Partial roads)
            # For traversable roads, create precise new node via edge splitting
            new_id = split_edge_at_point(G, u, v, key, (node_req.x, node_req.y))
            # Handle bidirectional edges by splitting reverse direction if it exists
            if G.has_edge(v, u):
                rev_keys = list(G[v][u].keys())
                if rev_keys: split_edge_at_point(G, v, u, rev_keys[0], (node_req.x, node_req.y))
            final_node_id = new_id or u    # Fallback to u if splitting failed
            
        # Store mapping between original request and final graph node ID
        snapped_nodes.append({"graph_id": final_node_id, "req": node_req})

    return G, snapped_nodes
########################