"""
File main.py
Author Youssef Elebiary
Brief Main Functions for RescuNet
Version 1.0
Date 2025-11-25
Copyright (c) 2025
"""

# ========== IMPORTING LIBRARIES ========== #
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from starlette.status import HTTP_200_OK
from starlette.status import HTTP_400_BAD_REQUEST
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

import asyncio
import json
import sys
import re
from pathlib import Path
from typing import List

import torch
import cv2
import numpy as np
import threading

from ultralytics import YOLO
from models.rescunet import (
    RescuNet,
    extract_pyg_data,
)
from models.text_classifier import (
    load_text_classifier,
)

from networkx import (
    MultiDiGraph,
    NetworkXError,
)

from .utils import (
    graph_to_json,
    edit_edges,
    integrate_nodes_into_graph,
    deduplicate_nodes,
)

from .cache import (
    get_graph,
    make_bbox_key,
)

from .models import (
    RouteRequest,
    Bbox,
)
from pydantic import BaseModel

try:
    import rescunet
    USE_CPP_SOLVER = True
    print("\nUsing C++ Engine\n")
except ImportError:
    from router import python_router as python_router
    USE_CPP_SOLVER = False
    print("\nC++ Engine Not Found")
    print("Using Python Fallback\n")
########################



# ========== GLOBAL VARS & CONFIG ========== #
current_mode = "rgb"
device: torch.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

sys.path.insert(0, str(Path(__file__).parent.parent))
########################



# ========== LOADING THE MODELS ========== #
try:
    thermal_model = YOLO("./models/weights/thermal.pt")
    thermal_model.to(device=device)
    print(f"Thermal model loaded successfully to device: {device}")
except Exception as e:
    print(f"Warning: Could not load YOLO model: {e}")
    thermal_model = None

try:
    fire_model = YOLO("./models/weights/fire.pt")
    fire_model.to(device=device)
    print(f"Fire model loaded successfully to device: {device}")
except Exception as e:
    print(f"Warning: Could not load YOLO model: {e}")
    fire_model = None

try:
    people_model = YOLO("./models/weights/people.pt")
    people_model.to(device=device)
    print(f"People model loaded successfully to device: {device}")
except Exception as e:
    print(f"Warning: Could not load YOLO model: {e}")
    people_model = None

try:
    rescunet_model = RescuNet()
    rescunet_model.load_model(model_path="./models/weights/rescunet.pt", device=device)
    print(f"GNN model loaded successfully to device: {device}")
except Exception as e:
    print(f"Warning: Could not load Rescunet model: {e}")
    rescunet_model = None

try:
    text_classifier_model, vocab = load_text_classifier(model_path="./models/weights/text_classifier.pt", device=device)
    print(f"Text classifier model loaded successfully to device: {device}\n")
except Exception as e:
    print(f"Warning: Could not load Text classifier model: {e}")
    text_classifier_model = None
########################



# ========== FASTAPI SETUP ========== #
app = FastAPI(
    title="RescuNet",
    description="API for RescuNet",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=['*'],
    allow_methods=["*"],
    allow_headers=["*"],
)
########################



# ========== WEBSOCKET MANAGER ========== #
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: bytes):
        for connection in self.active_connections:
            try:
                await connection.send_bytes(message)
            except Exception:
                # Handle broken pipe or closed connection
                pass

manager = ConnectionManager()
########################

# ========== TEXT ANALYSIS HELPERS ========== #
class TextAnalysisRequest(BaseModel):
    text: str

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r'https?://\S+|www\.\S+', '', text)
    text = re.sub(r'[^\w\s]', '', text)
    return text

def tokenize_text(text: str, vocab: dict, max_len: int = 100) -> torch.Tensor:
    text = clean_text(text)
    words = text.split()
    
    # Map words to indices
    indices = [vocab.get(word, vocab.get('<UNK>', 1)) for word in words]
    
    # Pad or Truncate
    if len(indices) < max_len:
        indices += [vocab.get('<PAD>', 0)] * (max_len - len(indices))
    else:
        indices = indices[:max_len]
        
    return torch.tensor([indices], dtype=torch.long) # Batch size 1
########################

# ========== INFERENCE HELPER ========== #
def run_inference(frame_bytes, mode):
    # Decode and Resize in thread
    nparr = np.frombuffer(frame_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    
    img = cv2.resize(img, (640, 640))

    if mode == "thermal" and thermal_model:
        # Inference (Persons)
        results = thermal_model(img)
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = int(box.xyxy[0][0]), int(box.xyxy[0][1]), int(box.xyxy[0][2]), int(box.xyxy[0][3])
                conf = box.conf[0].cpu().numpy()
                
                if conf < 0.45: continue # Threshold

                cv2.rectangle(img, (x1, y1), (x2, y2), (255, 0, 0), 2)
                label = f"Person {conf:.2f}"
                
                # Draw text below if it goes off-screen
                text_y = y1 - 10 if y1 - 10 > 10 else y1 + 20
                cv2.putText(img, label, (x1 + 5, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 2)

    elif mode == "rgb":
        fire_results = None
        people_results = None

        def run_fire_model():
            nonlocal fire_results
            if fire_model:
                fire_results = fire_model(img)
        
        def run_people_model():
            nonlocal people_results
            if people_model:
                people_results = people_model(img)
        
        # Run both models in parallel
        fire_thread = threading.Thread(target=run_fire_model)
        people_thread = threading.Thread(target=run_people_model)
        
        fire_thread.start()
        people_thread.start()
        
        fire_thread.join()
        people_thread.join()
        
        # Inference (Fire)
        if fire_results:
            for result in fire_results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = int(box.xyxy[0][0]), int(box.xyxy[0][1]), int(box.xyxy[0][2]), int(box.xyxy[0][3])
                    conf = box.conf[0].cpu().numpy()
                
                    if conf < 0.45: continue # Threshold

                    cls = int(box.cls[0])
                    class_name = result.names[cls]
                    
                    # Color Selection (BGR)
                    if class_name.lower() == "fire":
                        color = (0, 0, 255) # Red
                    elif class_name.lower() == "smoke":
                        color = (200, 200, 200) # Gray
                    else:
                        color = (0, 165, 255) # Orange (Default)

                    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
                    label = f"{class_name} {conf:.2f}"
                
                    # Draw text below if it goes off-screen
                    text_y = y1 - 10 if y1 - 10 > 10 else y1 + 20
                    cv2.putText(img, label, (x1 + 5, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

        # Inference (People)
        if people_results:
            for result in people_results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = int(box.xyxy[0][0]), int(box.xyxy[0][1]), int(box.xyxy[0][2]), int(box.xyxy[0][3])
                    conf = box.conf[0].cpu().numpy()
                
                    if conf < 0.45: continue # Threshold

                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    label = f"Person {conf:.2f}"
                
                    # Draw text below if it goes off-screen
                    text_y = y1 - 10 if y1 - 10 > 10 else y1 + 20
                    cv2.putText(img, label, (x1 + 5, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    # Encode back to JPEG in thread
    _, encoded_img = cv2.imencode('.jpg', img)
    return encoded_img.tobytes()
########################

# ========== ENDPOINTS ========== #

@app.websocket("/ws/drone")
async def websocket_drone(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive frame bytes
            data = await websocket.receive_bytes()
            
            # Skip inference if no clients are connected
            if not manager.active_connections:
                await asyncio.sleep(0.01) # Yield control to allow disconnects to process
                continue

            # Inference (Offloaded to thread)
            global current_mode
            frame_bytes = await asyncio.to_thread(run_inference, data, current_mode)
            
            if frame_bytes:
                # Broadcast to clients
                await manager.broadcast(frame_bytes)
                
    except WebSocketDisconnect:
        print("Drone disconnected")
    except Exception as e:
        print(f"Drone error: {e}")

@app.websocket("/ws/client")
async def websocket_client(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Receive control commands
            data = await websocket.receive_text()
            message = json.loads(data)
            if "mode" in message:
                global current_mode
                current_mode = message["mode"]
                print(f"Switched mode to: {current_mode}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/health")
def health_check():
    return JSONResponse(content={"status": "ok"}, status_code=HTTP_200_OK)

@app.post("/api/load-graph")
def load_graph(bbox: Bbox) -> JSONResponse:
    try:
        G: MultiDiGraph = get_graph(north=bbox.north, south=bbox.south, east=bbox.east, west=bbox.west)
    except NetworkXError as e:
        return JSONResponse(content={"error": str(e)}, status_code=HTTP_400_BAD_REQUEST)
    session_id = make_bbox_key(bbox.north, bbox.south, bbox.east, bbox.west)
    geojson: str = graph_to_json(G)
    if G is not None:
        return JSONResponse(content={
            "graph_uuid": session_id,
            "geojson": geojson
        }, status_code=HTTP_200_OK)
    else:
        return JSONResponse(content={"error": "Failed to download graph"}, status_code=HTTP_500_INTERNAL_SERVER_ERROR)


@app.post("/api/analyze-text")
def analyze_text(req: TextAnalysisRequest) -> JSONResponse:
    if not text_classifier_model:
        return JSONResponse(content={"error": "Text classifier model not loaded"}, status_code=HTTP_500_INTERNAL_SERVER_ERROR)
    
    try:
        # Tokenize
        input_ids = tokenize_text(req.text, vocab).to(device)
        
        # Inference
        with torch.no_grad():
            logits = text_classifier_model(input_ids, use_temperature=True)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
            
        # Logic provided by user
        CONFIDENCE_THRESHOLD = 0.65
        confidence = float(probs[1]) # Probability of class 1 (Real Disaster)
        
        is_real = confidence > CONFIDENCE_THRESHOLD
        
        if is_real:
            if confidence > 0.85:
                priority = "HIGH - Immediate attention required"
            elif confidence > 0.70:
                priority = "MEDIUM - Review within 1 hour"
            else:
                priority = "LOW - Review when possible"
            prediction = "REAL DISASTER"
        else:
            priority = "IGNORE - Not a real disaster"
            prediction = "FAKE/ABSURD"
        
        return JSONResponse(content={
            "prediction": prediction,
            "confidence": confidence,
            "priority": priority,
            "probabilities": {
                "emergency": confidence,
                "not_emergency": 1.0 - confidence,
            }
        }, status_code=HTTP_200_OK)
        
    except Exception as e:
        print(f"Text Analysis Failed: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=HTTP_500_INTERNAL_SERVER_ERROR)


@app.post("/api/infer-routes")
def infer_routes(req: RouteRequest) -> JSONResponse:
    try:
        G_cached = get_graph(req.bbox.north, req.bbox.south, req.bbox.east, req.bbox.west)
        if not G_cached:
            return JSONResponse(content={"error": "Graph not found"}, status_code=HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Deduplicate nodes
        clean_nodes = deduplicate_nodes(req.nodes)
        
        # Copy the cached graph
        G_viz = G_cached.copy()
        G_routing = G_cached.copy().to_undirected()

        # Add the edge states
        G_viz = edit_edges(G_viz, req.modified_edges)
        G_routing = edit_edges(G_routing, req.modified_edges)
        
        # Add the survivor/pickup nodes into the graph
        G_viz, _ = integrate_nodes_into_graph(G_viz, clean_nodes)
        G_routing, snapped_data = integrate_nodes_into_graph(G_routing, clean_nodes)

        if rescunet_model is not None:
            try:
                data, ordered_edges = extract_pyg_data(G_routing)
                data = data.to(device=device)
                with torch.no_grad():
                    logits = rescunet_model(data.x, data.edge_index, data.edge_attr, batch=None)
                    probs = torch.sigmoid(logits).cpu().numpy()

                for i, (u, v, k) in enumerate(ordered_edges):
                    prob = float(probs[i])
                    length: float = G_routing[u][v][k].get('length', 1.0)
                    state: str = G_routing[u][v][k].get('state', 'clear')
                    
                    base_mult = 1.0
                    if state == 'blocked': base_mult = 10000.0
                    elif state == 'partial': base_mult = 5.0
                    
                    neural_discount = 1.0 - (prob * 0.8)
                    
                    G_routing[u][v][k]['travel_cost'] = length * base_mult * neural_discount
                    
            except Exception as e:
                print(f"GNN Inference Failed: {e}. Falling back to standard weights.")
                # Fallback weighting if GNN fails
                for u, v, k, d in G_routing.edges(keys=True, data=True):
                    length = d.get('length', 1)
                    state = d.get('state', 'clear')
                    mult = 10000 if state == 'blocked' else (5 if state == 'partial' else 1)
                    G_routing[u][v][k]['travel_cost'] = length * mult
        else:
            # Adding the weights to the edges
            for u, v, k, d in G_routing.edges(keys=True, data=True):
                length = d.get('length', 1)
                state = d.get('state', 'clear')
                mult = 10000 if state == 'blocked' else (5 if state == 'partial' else 1)
                G_routing[u][v][k]['travel_cost'] = length * mult

        # Getting the IDs of the pickup nodes
        pickups_ids = [
            item['graph_id'] for item in snapped_data if item['req'].type == 'pickup'
        ]
        if not pickups_ids:
            raise HTTPException(HTTP_400_BAD_REQUEST, "No pickups defined.")

        # Map GraphID -> {urgency, count, graph_id}
        survivors_map = {}
        
        for item in snapped_data:
            if item['req'].type != 'survivor':
                continue
            
            gid = item['graph_id']
            urg = item['req'].urgency
            cnt = item['req'].count
            
            if gid in survivors_map:
                # Aggregate: Max urgency, Sum count
                survivors_map[gid]['req'].urgency = max(survivors_map[gid]['req'].urgency, urg)
                survivors_map[gid]['req'].count += cnt
            else:
                # Store reference
                survivors_map[gid] = item
        
        # Convert back to list for solver
        survivors_data = list(survivors_map.values())

        # Multi-Vehicle Routing
        all_paths_node_ids = []

        if USE_CPP_SOLVER:
            # Get Edges
            edges_for_cpp = []
            for u, v, k, d in G_routing.edges(keys=True, data=True):
                weight = d.get('travel_cost', d.get('length', 1))
                edges_for_cpp.append((int(u), int(v), float(weight)))
                edges_for_cpp.append((int(v), int(u), float(weight))) 
            
            # Get Survivor Nodes
            survivor_input = []
            for item in survivors_data:
                survivor_input.append({
                    "id": item['graph_id'],
                    "urgency": item['req'].urgency,
                    "count": item['req'].count
                })

            # Solve
            all_paths_node_ids = rescunet.solve_routes(
                survivor_input,
                [int(x) for x in pickups_ids],
                edges_for_cpp
            )
        else:
            all_paths_node_ids = python_router.solve_routes(G_routing, survivors_data, pickups_ids)

        # Construct Response
        routes_features = []
        for vehicle_idx, path_nodes in enumerate(all_paths_node_ids):
            if len(path_nodes) < 2:
                continue

            full_path_coords = []
            for i in range(len(path_nodes) - 1):
                u = path_nodes[i]; v = path_nodes[i+1]
                if G_routing.has_edge(u, v):
                    edge_data = min(G_routing[u][v].values(), key=lambda x: (0 if 'geometry' in x else 1, x.get('travel_cost', float('inf'))))

                    if 'geometry' in edge_data:
                        coords = list(edge_data['geometry'].coords)
                        u_node = G_routing.nodes[u]
                        start_dist = (coords[0][0]-u_node['x'])**2 + (coords[0][1]-u_node['y'])**2
                        end_dist = (coords[-1][0]-u_node['x'])**2 + (coords[-1][1]-u_node['y'])**2
                        if end_dist < start_dist: coords.reverse()
                        full_path_coords.extend(coords)
                    else:
                        full_path_coords.extend([[G_routing.nodes[u]['x'], G_routing.nodes[u]['y']], [G_routing.nodes[v]['x'], G_routing.nodes[v]['y']]])

            feature = {"type": "Feature", "properties": {"vehicle_id": vehicle_idx, "type": "route"}, "geometry": {"type": "LineString", "coordinates": full_path_coords}}
            routes_features.append(feature)

        return JSONResponse(content={
            "type": "FeatureCollection",
            "features": routes_features,
        }, status_code=HTTP_200_OK)
    except Exception as e:
        from traceback import print_exc
        print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=500)
