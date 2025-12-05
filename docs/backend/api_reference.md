# API Reference

This document provides a detailed reference for the RescuNet Backend API, including HTTP endpoints, WebSocket channels, and data models.

## Base URL
`http://localhost:8000`

---

## HTTP Endpoints

### 1. Health Check
**GET** `/api/health`

Checks if the API server is running and responsive.

- **Response**: `200 OK`
  ```json
  {
    "status": "ok"
  }
  ```

### 2. Load Graph
**POST** `/api/load-graph`

Downloads and caches the road network graph for a specified bounding box. Returns the GeoJSON representation of the graph for visualization.

- **Request Body**: `Bbox`
  ```json
  {
    "north": 30.05,
    "south": 30.00,
    "east": 31.25,
    "west": 31.20
  }
  ```

- **Response**: `200 OK`
  ```json
  {
    "graph_uuid": "30.05_30.00_31.25_31.20",
    "geojson": { ... } // FeatureCollection of LineStrings
  }
  ```

### 3. Infer Routes
**POST** `/api/infer-routes`

Calculates optimal rescue routes for multiple vehicles based on survivor locations, urgencies, and road conditions.

- **Request Body**: `RouteRequest`
  ```json
  {
    "graph_uuid": "30.05_30.00_31.25_31.20",
    "nodes": [
      {
        "id": 12345,
        "x": 31.22,
        "y": 30.02,
        "type": "survivor",
        "urgency": 5,
        "count": 2
      },
      {
        "id": 67890,
        "x": 31.23,
        "y": 30.03,
        "type": "pickup"
      }
    ],
    "modified_edges": [
      {
        "u": 111,
        "v": 222,
        "state": "blocked"
      }
    ],
    "start_location": { "lat": 30.01, "lon": 31.21 },
    "bbox": { ... }
  }
  ```

- **Response**: `200 OK`
  ```json
  {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": { "vehicle_id": 0, "type": "route" },
        "geometry": {
          "type": "LineString",
          "coordinates": [[31.21, 30.01], [31.22, 30.02], ...]
        }
      }
    ]
  }
  ```

---

## WebSocket Channels

### 1. Drone Feed
**WS** `/ws/drone`

- **Purpose**: Receives raw video frames from the drone, performs AI inference, and broadcasts the processed frames to connected clients.
- **Input**: Binary JPEG data.
- **Output**: Binary JPEG data (with bounding boxes and labels drawn).

### 2. Client Control
**WS** `/ws/client`

- **Purpose**: Handles control messages from the frontend client, such as switching inference modes.
- **Message Format**:
  ```json
  {
    "mode": "thermal" // or "rgb"
  }
  ```

---

## Data Models

### Bbox
| Field | Type | Description |
|-------|------|-------------|
| `north` | float | Northern latitude (-90 to 90) |
| `south` | float | Southern latitude (-90 to 90) |
| `east` | float | Eastern longitude (-180 to 180) |
| `west` | float | Western longitude (-180 to 180) |

### NodeData
| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier for the node |
| `x` | float | Longitude |
| `y` | float | Latitude |
| `type` | string | "survivor" or "pickup" |
| `urgency` | int? | Urgency level (required for survivors) |
| `count` | int? | Number of survivors (required for survivors) |

### EdgeModification
| Field | Type | Description |
|-------|------|-------------|
| `u` | int | Source node ID |
| `v` | int | Target node ID |
| `state` | string | "clear", "partial", or "blocked" |
