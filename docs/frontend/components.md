# Components

This document outlines the reusable UI components used throughout the RescuNet frontend.

## Global Components

These components are used across multiple pages or as part of the main application layout.

### 1. Navbar (`src/components/Navbar.jsx`)

The top navigation bar provides access to the main sections of the application.

-   **Features**:
    -   Responsive design (collapses on mobile).
    -   Active route highlighting.
    -   Logo and branding.
-   **Links**:
    -   Home (`/`)
    -   Route Planner (`/route`)
    -   Live Feed (`/live-feed`)
    -   Drone Sim (`/drone-simulation`)
    -   Text Analysis (`/text-analysis`)

### 2. Footer (`src/components/Footer.jsx`)

The page footer, typically displayed on non-fullscreen pages (like Home and Text Analysis).

-   **Content**: Copyright information and secondary links.
-   **Behavior**: Hidden on `RoutePlanner` and `LiveFeed` to maximize screen real estate.

---

## Internal Components

These components are defined within specific pages but play a crucial role in the user interface.

### Route Planner Components

#### 1. NodePopup

A form displayed inside a MapLibre popup when adding a new node.

-   **Purpose**: Collects attributes for a new graph node.
-   **Fields**:
    -   **Type**: Dropdown (Survivor Group / Pickup Point).
    -   **Urgency**: Number input (1-10) [Survivor only].
    -   **Count**: Number input [Survivor only].
-   **Actions**: Save, Cancel.

#### 2. EdgePopup

A form displayed when clicking on a road segment (edge).

-   **Purpose**: Modifies the state of a road segment.
-   **Fields**:
    -   **Status**: Dropdown (Clear / Partial Obstruction / Blocked).
    -   **Apply to Street**: Checkbox to apply the status change to all segments with the same street name.
-   **Actions**: Update, Close.

#### 3. SearchResults

A dropdown list displaying location search results from the Photon API.

-   **Interaction**: Clicking a result centers the map on that location and sets the bounding box.
