# Routing Engine

RescuNet features a high-performance, custom-built routing engine designed to solve the **Multi-Vehicle Routing Problem (MVRP)** in real-time. It prioritizes survivors based on urgency and optimizes the deployment of multiple rescue units.

## 1. Hybrid Architecture

To ensure both performance and reliability, the system employs a hybrid approach:

-   **Primary Engine (C++)**: Written in C++11 and bound to Python using `pybind11`. It offers order-of-magnitude speedups for graph traversals and pathfinding.
-   **Fallback Engine (Python)**: A pure Python implementation using `NetworkX`. It activates automatically if the C++ extension fails to load, ensuring the system remains operational.

## 2. Core Algorithms

### A. Pathfinding (Dijkstra)
Both engines implement **Dijkstra's Algorithm** to find the shortest path between two nodes in the weighted graph.
-   **Weights**: The "cost" of an edge is dynamically adjusted by the GNN (see [AI Models](./ai_models.md)).
-   **Optimization**: The C++ implementation uses a `std::priority_queue` for efficient node selection.

### B. Multi-Vehicle Greedy Routing
The system uses a greedy strategy to assign survivors to vehicles. This approach is computationally efficient enough for real-time updates while providing near-optimal results for emergency scenarios.

**The Algorithm:**

1.  **Initialization**: All vehicles start at their designated pickup/depot locations.
2.  **Iterative Assignment**:
    -   In each step, the algorithm evaluates every possible pair of `(Available Vehicle, Unassigned Survivor)`.
    -   It calculates a **Priority Score** for each pair.
3.  **Scoring Formula**:
    $$ Score = \frac{Arrival Time}{Urgency^2 + SurvivorCount} $$
    -   **Arrival Time**: Total distance the vehicle has traveled + distance to this survivor.
    -   **Urgency**: Criticality of the survivor (1-10). Squared to exponentially prioritize critical cases.
    -   **Survivor Count**: Number of people at the location.
    -   *Lower Score = Higher Priority*.
4.  **Selection**: The pair with the lowest score is selected. The vehicle is assigned to that survivor, and its current location is updated.
5.  **Return to Base**: Once all survivors are assigned (or no reachable survivors remain), vehicles are routed back to the nearest pickup point.

## 3. C++ Implementation Details

The C++ core is located in `backend/router/router.cpp`.

-   **`RescueRouter` Class**: Manages the adjacency list and implements the logic.
-   **`solve_routes` Function**: The entry point exposed to Python. It converts Python dictionaries and tuples into C++ structs (`Survivor`, `Edge`) before processing.
-   **Memory Management**: Uses standard STL containers (`std::vector`, `std::unordered_map`) for robust memory handling.

## 4. Python Fallback Details

The Python implementation is located in `backend/router/python_router.py`.

-   **NetworkX Integration**: Directly operates on the `MultiDiGraph` object.
-   **Error Handling**: Catches `NetworkXNoPath` exceptions to handle unreachable nodes gracefully.
