# AI & Machine Learning Models

RescuNet employs a hybrid AI approach, combining computer vision for real-time situational awareness with graph neural networks for intelligent route planning.

## 1. Graph Neural Network (RescuNet GNN)

The core of our intelligent routing system is a custom **Graph Neural Network (GNN)** designed to predict the "traversability cost" of road segments based on static map data and dynamic hazard reports.

### Architecture

The model is built using **PyTorch Geometric** and features a custom architecture:

-   **Input Layer**:
    -   **Node Features**: `[type, urgency, survivor_count]`
        -   `type`: Embedding (Road, Survivor, Pickup)
        -   `urgency`: Int (0-10)
        -   `survivor_count`: Int
    -   **Edge Features**: `[log_distance, state]`
        -   `log_distance`: Log-transformed length of the road segment.
        -   `state`: Categorical (Clear=0, Partial=1, Blocked=2).

-   **Encoder**:
    -   **Node Encoder**: MLP + LayerNorm to project features to hidden dimension (64).
    -   **Edge Encoder**: MLP + LayerNorm to project edge attributes.

-   **Message Passing**:
    -   3 Layers of **GINEConv** (Graph Isomorphism Network with Edge features).
    -   Allows nodes to aggregate information from their neighbors, effectively "learning" the topology and hazard spread.

-   **Decoder**:
    -   MLP that takes the concatenated features of source node $u$, target node $v$, and edge $e_{uv}$.
    -   **Output**: A single scalar logit representing the predicted edge weight modifier.

<div align="center">
    <img src="../assets/gnn.png" alt="GNN Architecture Diagram" width="500">
</div>

### Usage in Routing

1.  **Graph Construction**: The OpenStreetMap road network is converted into a PyTorch Geometric `Data` object.
2.  **Inference**: The GNN processes the graph and outputs a probability score $P_{edge}$ for each edge.
3.  **Cost Adjustment**:
    $$ Cost_{final} = Length \times BaseMultiplier \times (1.0 - (P_{edge} \times 0.8)) $$
    -   This formula effectively "discounts" the cost of safer, more desirable paths as predicted by the AI, guiding the routing engine towards them.

---

## 2. Computer Vision (YOLOv11)

We utilize the **Ultralytics YOLOv11** architecture for high-speed, real-time object detection on drone video feeds. The system operates in two distinct modes:

<div align="center">
    <img src="../assets/yolo.png" alt="YOLOv11 Architecture Diagram" width="700">
    <br>
    <i>Diagram courtesy of Ultralytics (Usage subject to license terms)</i>
</div>

### Modes of Operation

#### Thermal Mode
-   **Objective**: Detect survivors in low-visibility conditions (night, smoke, debris).
-   **Model**: Custom-trained YOLOv11 model (`thermal.pt`).
-   **Classes**: `Person`.
-   **Visualization**: Blue bounding boxes.

#### RGB Mode
-   **Objective**: Detect fire hazards and survivors in standard daylight conditions.
-   **Models**: Two separate models run in parallel threads:
    1.  **Fire Model** (`fire.pt`): Detects `Fire` and `Smoke`.
    2.  **People Model** (`people.pt`): Detects `Person`.
-   **Visualization**: Red bounding boxes for Fire/Smoke, Green for Persons.

### Inference Pipeline
1.  **Frame Decoding**: Incoming MJPEG frames from the WebSocket are decoded into OpenCV images.
2.  **Preprocessing**: Images are resized to `640x640` for optimal inference speed.
3.  **Inference**:
    -   **Threading**: In RGB mode, the two models run on separate threads to minimize latency.
    -   **Thresholding**: Detections with a confidence score below `0.45` are discarded to reduce false positives.
4.  **Post-processing**: Bounding boxes and labels are drawn directly onto the frame.
    -   *Adaptive Text*: Labels are rendered below the box if the object is too close to the top edge of the frame.
5.  **Encoding**: The processed frame is re-encoded to JPEG and broadcast to clients.

---

## 3. Text Analysis (LSTM)

The system employs a **Long Short-Term Memory (LSTM)** network to classify incoming distress messages. This ensures that resources are prioritized for genuine emergencies.

### Architecture

<div align="center">
    <img src="../assets/text_classifier.png" alt="Text Classifier Architecture Diagram" width="500">
</div>

-   **Model Type**: Recurrent Neural Network (RNN) with LSTM units.
-   **Embedding Layer**: Converts tokenized words into dense vectors of fixed size.
-   **LSTM Layer**: Processes the sequence of embeddings, capturing context and long-term dependencies in the text.
-   **Fully Connected Layer**: Maps the final hidden state of the LSTM to class scores (logits).

### Preprocessing Pipeline

1.  **Cleaning**:
    -   Convert to lowercase.
    -   Remove URLs and special characters (punctuation).
2.  **Tokenization**:
    -   Split text into individual words.
    -   Map words to integer indices using a predefined vocabulary.
    -   Handle unknown words with an `<UNK>` token.
3.  **Padding**:
    -   Sequences are padded or truncated to a fixed length (e.g., 128 tokens) to ensure uniform input size.

### Classification Logic

The model outputs a probability score for the "Real Disaster" class ($P_{real}$).

-   **Prediction**:
    -   If $P_{real} > 0.65$: **REAL DISASTER**
    -   Else: **FAKE/ABSURD**

-   **Priority Assignment** (for Real Disasters):
    -   $P_{real} > 0.85$: **HIGH** - Immediate attention required.
    -   $P_{real} > 0.70$: **MEDIUM** - Review within 1 hour.
    -   Else: **LOW** - Review when possible.

