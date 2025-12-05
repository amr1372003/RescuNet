# Frontend Architecture

## Overview

The RescuNet frontend is a Single Page Application (SPA) built with **React 19** and **Vite**. It is designed to be lightweight, fast, and responsive, with a heavy focus on real-time data visualization using interactive maps and video feeds.

## Core Technologies

-   **React**: UI library for building component-based interfaces.
-   **Vite**: Next-generation frontend tooling for fast development and optimized builds.
-   **Tailwind CSS**: Utility-first CSS framework for rapid and consistent styling.
-   **MapLibre GL JS**: Open-source library for rendering interactive vector maps (fork of Mapbox GL JS).
-   **React Router**: Standard routing library for React.

## Application Structure

The application is structured around **Pages** (views) and **Components** (reusable UI elements).

```
src/
├── assets/                  # Static assets (images, icons)
├── components/              # Reusable UI components
│   ├── Navbar.jsx           # Top navigation bar
│   └── Footer.jsx           # Page footer
├── pages/                   # Main application views
│   ├── Home.jsx             # Landing page
│   ├── RoutePlanner.jsx     # Map-based rescue coordination
│   ├── LiveFeed.jsx         # Real-time drone video feed
│   ├── DroneSimulation.jsx  # Simulation control
│   └── TextAnalysis.jsx     # Text analysis view
├── App.jsx                  # Main layout and routing configuration
├── main.jsx                 # Entry point
└── index.css                # Global styles and Tailwind directives
```

## Routing

Routing is handled by `react-router-dom`. The `App` component defines the main routes:

-   `/`: **Home** - Dashboard overview.
-   `/route`: **RoutePlanner** - The core map interface for planning rescue missions.
-   `/live-feed`: **LiveFeed** - Real-time video stream from the drone.
-   `/text-analysis`: **TextAnalysis** - Interface for processing text reports.
-   `/drone-simulation`: **DroneSimulation** - Controls for the simulation environment.

The layout adapts based on the route; for example, `RoutePlanner` and `LiveFeed` use a full-screen layout without a footer to maximize the visualization area.

## State Management

The application primarily uses **Local State** via React Hooks (`useState`, `useRef`, `useEffect`).

-   **Component State**: UI state (modals, form inputs, toggles) is managed within the specific component.
-   **Map State**: The MapLibre instance is stored in a `useRef` to persist across renders without triggering re-renders. Map interactions (clicks, moves) update local state variables which then trigger UI updates (e.g., showing a popup).
-   **Data Fetching**: Data is fetched directly from the backend API using `fetch` within `useEffect` hooks or event handlers.

## Map Integration

The `RoutePlanner` component heavily integrates with **MapLibre GL JS**.

1.  **Initialization**: The map is initialized in a `useEffect` hook once the component mounts.
2.  **Refs**: `useRef` is used to hold the `map` instance, ensuring it's accessible throughout the component's lifecycle but doesn't cause React render loops.
3.  **Layers & Sources**: GeoJSON data is managed via MapLibre sources. Layers (lines, symbols) are added to visualize roads, routes, and nodes.
4.  **Interactivity**: Event listeners (`click`, `mouseenter`) are attached to the map instance to handle user interactions like selecting roads or adding nodes.

## Styling

Styling is almost exclusively handled via **Tailwind CSS**.
-   **Utility Classes**: Used for layout, spacing, colors, and typography.
-   **Custom CSS**: `index.css` contains global resets and specific overrides for map popups or scrollbars.
-   **Dark Mode**: The application defaults to a dark theme (`bg-slate-950`, `text-slate-200`) to reduce eye strain and improve contrast for map visualizations.
