# Pages & Features

This document details the main views (pages) of the RescuNet application.

## 1. Route Planner (`/route`)

The **Route Planner** is the core operational interface for disaster response. It allows operators to visualize the road network, identify survivor locations, and calculate optimal rescue routes.

### Key Features

-   **Location Search**:
    -   Integrated search bar using the **Photon API** (OpenStreetMap data).
    -   Supports direct coordinate input (Lat, Lon).
    -   "My Location" button to use the browser's Geolocation API.
-   **Interactive Map**:
    -   Powered by **MapLibre GL JS**.
    -   Renders the road network graph (nodes and edges) fetched from the backend.
    -   **Road Status**: Edges are color-coded based on their status:
        -   <span style="color: #10B981">**Green**</span>: Clear
        -   <span style="color: #F59E0B">**Amber**</span>: Partial Obstruction
        -   <span style="color: #EF4444">**Red**</span>: Blocked
-   **Graph Editing**:
    -   **Add Nodes**: Click anywhere on the map to add a "Survivor Group" (with urgency/count) or a "Pickup Point".
    -   **Modify Roads**: Click on any road segment to change its status (Clear/Partial/Blocked). Supports applying changes to the entire street name.
-   **Route Calculation**:
    -   "Calculate Routes" button sends the current graph state (including user modifications) to the backend.
    -   Visualizes the calculated paths for multiple vehicles, each with a distinct color.
    -   Displays directional arrows along the route for navigation.

### Usage Flow

1.  **Search**: Enter a location (e.g., "Maadi") and select a result.
2.  **Load Map**: Click "Load Map Data" to fetch the road network for the selected area.
3.  **Annotate**:
    -   Add **Survivor** nodes where help is needed.
    -   Add **Pickup** nodes (depots/hospitals).
    -   Mark roads as **Blocked** if known.
4.  **Plan**: Click "Calculate Routes" to generate the rescue plan.

---

## 2. Live Feed (`/live-feed`)

The **Live Feed** page provides real-time situational awareness by streaming video from the rescue drone.

### Key Features

-   **WebSocket Streaming**: Connects to `ws://localhost:8000/ws/drone` to receive processed video frames.
-   **AI Visualization**:
    -   Renders bounding boxes for detected objects (Survivors, Fire, Smoke).
    -   Displays confidence scores and labels.
-   **Mode Switching**: Toggle between **RGB** (Standard) and **Thermal** camera modes via the "Switch Mode" button.

---

## 3. Drone Simulation (`/drone-simulation`)

The **Drone Simulation** page acts as a virtual drone source, allowing operators to stream video feeds to the backend for AI processing without physical hardware.

### Key Features

-   **Source Selection**:
    -   **Camera**: Stream directly from the device's webcam.
    -   **File**: Upload and loop a video file to simulate a specific scenario.
-   **WebSocket Streaming**: Establishes a connection to the backend (`/ws/drone`) to transmit video frames for real-time inference.
-   **Live Preview**: Shows the raw video feed being sent to the server.

---

## 4. Text Analysis (`/text-analysis`)

The **Text Analysis** page provides an interface for the system's NLP pipeline, designed to filter and classify emergency reports.

### Key Features

-   **Input Methods**:
    -   **Direct Entry**: Paste text directly into the input area.
    -   **File Upload**: Drag and drop support for `.txt`, `.csv`, and `.json` files.
    -   **Batch Processing**: Automatically parses and analyzes multiple entries from uploaded files.
-   **Analysis Pipeline**:
    -   **Prediction**: Classifies text as **REAL DISASTER** or **FAKE/ABSURD**.
    -   **Priority**: Assigns a priority level (HIGH, MEDIUM, LOW, IGNORE) based on confidence scores.
-   **Visualization**:
    -   **Compact Layout**: Split-pane design for simultaneous input and result viewing.
    -   **Result List**: Scrollable list of analysis results for batch operations.
    -   **Confidence Indicators**: Visual progress bars showing the model's certainty.

---

## 5. Home (`/`)

The **Home** page serves as the main dashboard, providing a high-level overview of the system status and quick links to other modules.
