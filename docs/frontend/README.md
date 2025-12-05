# RescuNet Frontend Documentation

Welcome to the technical documentation for the RescuNet frontend. This application is a modern, high-performance React interface designed for real-time disaster response coordination.

## Table of Contents

1.  [**Architecture & Tech Stack**](./architecture.md)
    -   System design, state management, and library choices.
2.  [**Pages & Features**](./pages.md)
    -   Detailed documentation of key views: Route Planner, Live Feed, Drone Simulation, and Text Analysis.
3.  [**Components**](./components.md)
    -   Reusable UI components and design system.

## Getting Started

### Prerequisites

-   **Node.js**: v18+ recommended
-   **npm**: v9+

### Installation

1.  Navigate to the frontend directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running Locally

Start the development server:
```bash
npm run dev
```
The application will be available at `http://localhost:5173`.

## Tech Stack Overview

-   **Framework**: [React](https://react.dev/) (v19) with [Vite](https://vitejs.dev/) for build tooling.
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/) for utility-first styling.
-   **Maps**: [MapLibre GL JS](https://maplibre.org/) for interactive vector maps.
-   **Icons**: [FontAwesome](https://fontawesome.com/) and [Lucide React](https://lucide.dev/).
-   **State Management**: React Context API and Hooks.

## Directory Structure

-   `src/`
    -   `assets/`: Static assets (images, icons).
    -   `components/`: Reusable UI components (`Navbar`, `Footer`, etc.).
    -   `pages/`: Main application views (`RoutePlanner`, `LiveFeed`, etc.).
    -   `App.jsx`: Main application entry point and routing configuration.
    -   `main.jsx`: React root rendering.
