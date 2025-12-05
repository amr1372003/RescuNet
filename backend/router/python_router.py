"""
File python_router.py
Author Youssef Elebiary
Brief Python Routing Fallback for RescuNet
Version 1.0
Date 2025-11-25
Copyright (c) 2025
"""

# ========== IMPORTING LIBRARIES ========== #
from typing import (
    List,
    Dict,
    Any,
    Union
)

from networkx import (
    MultiDiGraph,
    MultiGraph,
    NetworkXNoPath,
    shortest_path,
    shortest_path_length,
)
########################



# ========== ROUTING ========== #
def solve_routes(G: Union[MultiDiGraph, MultiGraph], survivors: List[Dict[str, Any]], pickups_ids: List[int]) -> List[List[int]]:
    """Parallel Multi-source python fallback routing greedy algorithm

    Args:
        G (MultiDiGraph): Graph to route
        survivors (List[Dict[str, Any]]): List of survivor
        pickups_ids (List[int]): List of pickup node IDs

    Returns:
        List[List[int]]: List of all routes
    """

    # Initialize Vehicles
    pickup_vec = []
    for i, pid in enumerate(pickups_ids):
        pickup_vec.append({
            'id': i,
            'current_node': pid,
            'path': [pid],
            'total_distance': 0.0
        })
    
    # Copy list to be mutable
    remaining_survivors = survivors[:] 
    
    # Assign Survivors
    while remaining_survivors:
        best_global_score = float('inf')
        best_vehicle_idx = -1
        best_survivor_idx = -1
        best_segment_dist = 0
        
        # Check every pickup node with every survivor node for route optimization
        for v_idx, vehicle in enumerate(pickup_vec):
            current_pos = vehicle['current_node']
            
            for s_idx, survivor in enumerate(remaining_survivors):
                target_id = survivor['graph_id']
                
                if current_pos == target_id: continue 
                
                try:
                    # Get the path between start and target using Dijkstra's algorithm
                    dist = shortest_path_length(G, current_pos, target_id, weight='travel_cost')
                    
                    # Calculate the arrival time
                    arrival_time = vehicle['total_distance'] + dist
                    
                    urgency = survivor['req'].urgency
                    count = survivor['req'].count
                    
                    # Scoring formula: balance response time against impact
                    # Lower scores = higher priority
                    # urgency² gives exponential weight to critical cases
                    # + count ensures groups aren't overlooked
                    score = arrival_time / ( (urgency**2) + count )
                    
                    # Check if current score is better the global minimum
                    if score < best_global_score:
                        # Updating the global minimum variables
                        best_global_score = score
                        best_vehicle_idx = v_idx
                        best_survivor_idx = s_idx
                        best_segment_dist = dist
                except NetworkXNoPath:
                    continue
        
        # Checking if all survivors are reachable
        if best_vehicle_idx == -1:
            break
        
        # Winner found
        winner_vehicle = pickup_vec[best_vehicle_idx]
        target_survivor = remaining_survivors[best_survivor_idx]
        
        # Calculate path geometry
        path_segment = shortest_path(G, winner_vehicle['current_node'], target_survivor['graph_id'], weight='travel_cost')
        
        # Append path (skip first node to avoid duplication)
        if len(path_segment) > 1:
            winner_vehicle['path'].extend(path_segment[1:])
        
        # Update State
        winner_vehicle['current_node'] = target_survivor['graph_id']
        winner_vehicle['total_distance'] += best_segment_dist
        remaining_survivors.pop(best_survivor_idx)
    
    # Return survivors to nearest pickup
    all_paths = []
    
    for vehicle in pickup_vec:
        # Skip unused vehicles
        if len(vehicle['path']) <= 1: continue
        
        best_return_dist = float('inf')
        best_return_path = []
        
        for pid in pickups_ids:
            try:
                d = shortest_path_length(G, vehicle['current_node'], pid, weight='travel_cost')
                if d < best_return_dist:
                    best_return_dist = d
                    best_return_path = shortest_path(G, vehicle['current_node'], pid, weight='travel_cost')
            except: continue
        
        if best_return_path and len(best_return_path) > 1:
            vehicle['path'].extend(best_return_path[1:])
        
        all_paths.append(vehicle['path'])
        
    return all_paths
########################