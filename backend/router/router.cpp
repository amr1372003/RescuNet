/**
 * @file router.cpp
 * @author Youssef Elebiary
 * @brief This is the C++ backend for the routing algorithm used by RescuNet
 * @version 1.0
 * @date 2025-11-25
 * 
 * @copyright Copyright (c) 2025
 * 
 */



// Including Libraries
#include <pybind11/pybind11.h>    // PyBind11 Library
#include <pybind11/stl.h>         // PyBind11 Standard Template Library
#include <vector>
#include <queue>
#include <unordered_map>
#include <limits>
#include <algorithm>
#include <cmath>
////////////////////////



// Globals Declaration

// PyBind11 Namespace
namespace py = pybind11;

// Define NodeID Data Type
using NodeID = long long;
////////////////////////



// Struct Declarations

/**
 * @brief Represents the edge that connects 2 nodes and has a weight
 * 
 */
struct Edge {
    NodeID to;
    double weight;
};

/**
 * @brief Represents a survivor node with an `id`, `urgency` score and a `count` of survivors
 * 
 */
struct Survivor {
    NodeID id;
    int urgency;
    int count;
};

/**
 * @brief Represents a pickup node that will have vehicles traversing the graph to pick up `Survivor`
 * 
 */
struct Pickup {
    int id;
    NodeID current_node;
    std::vector<NodeID> path;     // History of visited nodes
    double total_distance;        // Tracks accumulated odometer
};
////////////////////////



// RescueRouter Main Class
/**
 * @brief RescueRouter - Core routing engine for RescuNet emergency response system
 * 
 * This class implements Dijkstra's algorithm for shortest path finding and
 * a greedy multi-vehicle routing algorithm to optimize survivor rescue operations
 * by minimizing response time while considering urgency and survivor count
 */
class RescueRouter {
public:
    std::unordered_map<NodeID, std::vector<Edge>> adj;    // Adjacency List

    /**
     * @brief Adds an edge in the graph connecting `u` and `v` with a `weight`
     * 
     * @param u The source node
     * @param v The destination node
     * @param weight The weight of the edge
     */
    void add_edge(NodeID u, NodeID v, double weight) {
        adj[u].push_back({v, weight});
    }

    /**
     * @brief Get the shortest path between `start` and `target`
     * 
     * @param start The start node
     * @param target The target node
     * @return `std::pair<double, std::vector<NodeID>>` containing the total cost and the path
     */
    std::pair<double, std::vector<NodeID>> dijkstra(NodeID start, NodeID target) {
        // If the start and target are the same then return 0 cost and the path is the start node only
        if (start == target) return {0.0, {start}};

        // Priority Queue for Dijkstra's Algorithm
        std::priority_queue<std::pair<double, NodeID>, 
                            std::vector<std::pair<double, NodeID>>, 
                            std::greater<std::pair<double, NodeID>>> pq;
        
        // Distance between each node and the start
        std::unordered_map<NodeID, double> dist;
        // Parent of each node
        std::unordered_map<NodeID, NodeID> parent;
        
        // Add starting node to the priority queue
        pq.push({0.0, start});
        // Set the distance of the starting node to 0
        dist[start] = 0.0;

        // Main Dijkstra Loop
        while (!pq.empty()) {
            // Get the node with the smallest distance
            double d = pq.top().first;
            NodeID u = pq.top().second;
            // Remove the node
            pq.pop();

            // If the distance of the current node is worse than the optimal distance
            // then skip it since a better path exists
            if (dist.find(u) != dist.end() && d > dist[u]) continue;
            // if current node is the target then the path is found
            if (u == target) break; 

            // If node is not in the adjacency list then skip it
            if (adj.find(u) == adj.end()) continue;
            
            // For each edge connected to the current node
            for (const auto& edge : adj[u]) {
                // If the distance to the current node + the weight to the next is less than the 
                // optimal then update the node distance
                if (dist.find(edge.to) == dist.end() || dist[u] + edge.weight < dist[edge.to]) {
                    // Update the distance
                    dist[edge.to] = dist[u] + edge.weight;
                    // Update the parent
                    parent[edge.to] = u;
                    // Add the node to the priority queue
                    pq.push({dist[edge.to], edge.to});
                }
            }
        }

        // If the distance to the target doesn't exist then return -1 and an
        // empty path since the target node is not reachable
        if (dist.find(target) == dist.end()) return {-1.0, {}}; 

        // Forming the path
        std::vector<NodeID> path;
        // Looping over the nodes and adding the parent of each node
        for (NodeID v = target; v != start; v = parent[v]) {
            path.push_back(v);
        }
        // Adding the start node since it is the beggining of the route
        path.push_back(start);
        // Reversing the path to get the correct order
        std::reverse(path.begin(), path.end());
        
        // Returning the total cost and the path
        return {dist[target], path};
    }

    /**
     * @brief Parallel Multi-source routing greedy algorithm
     *
     * 
     * STRATEGY OVERVIEW:
     * 
     * 1. Each vehicle starts at its pickup location
     * 
     * 2. Iteratively assign the most "cost-effective" survivor to available vehicles
     * 
     * 3. Cost calculation: arrival_time / (urgency² + survivor_count)
     * 
     * 4. Vehicles pick up survivors until all are assigned
     * 
     * 5. Finally, route all vehicles back to nearest pickup points
     * 
     * This prioritizes high-urgency cases while balancing vehicle workload.
     * 
     * 
     * @param survivors All the survivor nodes
     * @param pickups All the pickup nodes
     * @return `std::vector<std::vector<NodeID>>` All the routes to pickup all survivors and return to the pickup nodes
     */
    std::vector<std::vector<NodeID>> solve_multi_routes(
        std::vector<Survivor> survivors, 
        std::vector<NodeID> pickups
    ) {
        // Initializing the pickup nodes' paths
        std::vector<Pickup> pickups_vec;
        for (size_t i = 0; i < pickups.size(); ++i) {
            pickups_vec.push_back({(int)i, pickups[i], {pickups[i]}, 0.0});
        }

        // List of remaining survivors
        std::vector<Survivor> remaining_survivors = survivors;





        // Visiting the remaining survivors
        while (!remaining_survivors.empty()) {
            // Setting optimization variables
            double best_global_score = std::numeric_limits<double>::max();
            int best_vehicle_idx = -1;
            int best_survivor_idx = -1;
            std::vector<NodeID> best_segment;
            double best_segment_cost = 0;

            // Check every pickup node with every survivor node for route optimization
            for (size_t pickup_idx = 0; pickup_idx < pickups_vec.size(); ++pickup_idx) {
                for (size_t survivor_idx = 0; survivor_idx < remaining_survivors.size(); ++survivor_idx) {
                    // Getting start and target nodes
                    NodeID start = pickups_vec[pickup_idx].current_node;
                    NodeID target = remaining_survivors[survivor_idx].id;
                    
                    // Skip if already reached the target
                    if (start == target) continue;

                    // Get the path between start and target using Dijkstra's algorithm
                    std::pair<double, std::vector<NodeID>> result = dijkstra(start, target);
                    double leg_dist = result.first;

                    // Check if the route exists
                    if (leg_dist != -1.0) {
                        // Calculate the arrival time
                        double arrival_time = pickups_vec[pickup_idx].total_distance + leg_dist;
                        
                        // Get the survivor node meta data
                        int urg = remaining_survivors[survivor_idx].urgency;
                        int cnt = remaining_survivors[survivor_idx].count;
                        
                        // Scoring formula: balance response time against impact
                        // Lower scores = higher priority
                        // urgency² gives exponential weight to critical cases
                        // + count ensures groups aren't overlooked
                        double score = arrival_time / ((urg * urg) + cnt);
                        
                        // Check if current score is better the global minimum
                        if (score < best_global_score) {
                            // Updating the global minimum variables
                            best_global_score = score;
                            best_vehicle_idx = pickup_idx;
                            best_survivor_idx = survivor_idx;
                            best_segment = result.second;
                            best_segment_cost = leg_dist;
                        }
                    }
                }
            }

            // Checking if all survivors are reachable
            if (best_vehicle_idx == -1) {
                break; 
            }





            // Updating the location of the pickup node personnel
            Pickup &pickup_agent = pickups_vec[best_vehicle_idx];
            
            // Check if the segment is > 1 to insert it in the paths
            if (best_segment.size() > 1) {
                pickup_agent.path.insert(pickup_agent.path.end(), best_segment.begin() + 1, best_segment.end());
            }
            
            // Accumulate the distance
            pickup_agent.current_node = remaining_survivors[best_survivor_idx].id;
            pickup_agent.total_distance += best_segment_cost;

            // Remove the visited nodes
            remaining_survivors.erase(remaining_survivors.begin() + best_survivor_idx);
        }





        // Routing from survivor nodes to pickup node
        for (Pickup &v : pickups_vec) {
            // Checking if path exists
            if (v.path.size() <= 1) continue;

            // Optimizing the return distance from survivor to pickup
            double best_return_dist = std::numeric_limits<double>::max();
            std::vector<NodeID> return_path;

            // Checking distance to every pickup node
            for (NodeID p : pickups) {
                // Get the cost from current node to the `p` pickup node
                std::pair<double, std::vector<NodeID>> res = dijkstra(v.current_node, p);
                // Check if the path exists and if it is better than the global minimum
                if (res.first != -1.0 && res.first < best_return_dist) {
                    // Updating the global minimum variables
                    best_return_dist = res.first;
                    return_path = res.second;
                }
            }

            // Check if return path exists and is > 1
            if (!return_path.empty() && return_path.size() > 1) {
                // Add the path
                v.path.insert(v.path.end(), return_path.begin() + 1, return_path.end());
            }
        }





        // List of all the paths
        std::vector<std::vector<NodeID>> all_paths;
        // Adding all the paths
        for (const Pickup &v : pickups_vec) {
            // Checking if path exists
            if (v.path.size() > 1) {
                // Adding the path
                all_paths.push_back(v.path);
            }
        }

        // Returning all the paths
        return all_paths;
    }
};
////////////////////////



// Function Declarations

/**
 * @brief Represents the function that will be exposed to Python
 * 
 * @param survivors_dicts Survivor nodes data
 * @param pickups Pickup nodes data
 * @param edges The edges and their states
 * @return `std::vector<std::vector<NodeID>>` All the routes to pickup all survivors and return to the pickup nodes
 */
std::vector<std::vector<NodeID>> solve_routes(
    std::vector<py::dict> survivors_dicts, 
    std::vector<NodeID> pickups,
    std::vector<std::tuple<NodeID, NodeID, double>> edges
) {
    // Create RescueRouter object
    RescueRouter router;

    // Add the edges to the router
    for (const std::tuple<NodeID, NodeID, double> &e : edges) {
        router.add_edge(std::get<0>(e), std::get<1>(e), std::get<2>(e));
    }

    // Extract survivor data
    std::vector<Survivor> survivors;
    for (py::dict &d : survivors_dicts) {
        survivors.push_back({
            d["id"].cast<NodeID>(),
            d["urgency"].cast<int>(),
            d["count"].cast<int>()
        });
    }

    // Solve the routes and return the routes
    return router.solve_multi_routes(survivors, pickups);
}
////////////////////////



// Exposing the Python module
PYBIND11_MODULE(rescunet, m) {
    m.doc() = R"doc(
        RescuNet Routing Engine - Emergency Response Path Optimization

        This module provides high-performance routing algorithms for coordinating
        multiple rescue vehicles to efficiently evacuate survivors based on
        urgency levels and geographical constraints.
        
        Developed by Youssef Elebiary for RescuNet.
    )doc";

    m.def(
        "solve_routes",
        &solve_routes,
        "Calculate optimal multi-vehicle rescue paths considering urgency and distance",
        py::arg("survivors_dicts") = "List of survivor locations with urgency and count",
        py::arg("pickups") = "Starting nodes for rescue vehicles", 
        py::arg("edges") = "Graph edges as (from_node, to_node, weight) tuples"
    );
}
////////////////////////