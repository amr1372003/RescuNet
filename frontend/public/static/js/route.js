// --- Configuration ---
const mapStyle = {
    'version': 8,
    'sources': {
        'osm': {
            'type': 'raster',
            'tiles': ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            'tileSize': 256,
            'attribution': '&copy; OpenStreetMap Contributors'
        }
    },
    'layers': [
        {
            'id': 'osm',
            'type': 'raster',
            'source': 'osm',
            'minzoom': 0,
            'maxzoom': 19
        }
    ]
};

const backendUrl = `http://${window.location.hostname}:8000`;

// --- Global State ---
let map;
let nodes = [];
let modifiedEdges = [];
let currentGeoJSON = null;
let currentGraphUUID = null; // NEW: Stores the server-side session ID
let nodeCounter = 0;
let currentTempMarker = null;
let userLocationMarker = null;
let userAccuracyCircle = null;
let currentPopup = null;
let currentEdgePopup = null;
let userLocation = { lat: 30.0444, lon: 31.2357 };
let selectedSearchLocation = null;

const pickupIconUrl = 'https://cdn-icons-png.flaticon.com/512/190/190411.png';
const survivorIconUrl = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

document.addEventListener('DOMContentLoaded', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                console.log("User Location:", userLocation);
            },
            (err) => console.warn("Geolocation denied.", err),
            { enableHighAccuracy: true }
        );
    }
    setupSearchAutocomplete();
    setupLoadMapButton();
    setupUseLocationButton();
    setupInferButton();
});

// --- Search & Autocomplete ---
function setupSearchAutocomplete() {
    const searchInput = document.getElementById('searchBox');
    const resultsList = document.getElementById('searchResults');
    let debounceTimer;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();

        if (query.length < 3) {
            resultsList.classList.add('hidden');
            resultsList.classList.remove('active');
            return;
        }

        // FEATURE: Check if input is "Lat, Lon" coordinate pair
        // Regex checks for: number, comma, number (allowing decimals and negatives)
        const coordMatch = query.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);

        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lon = parseFloat(coordMatch[3]);

            // Basic validation range
            if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                // Create a synthetic feature for the dropdown
                const coordFeature = {
                    properties: {
                        name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                        city: "Jump to Coordinates",
                        country: "GPS Direct Input"
                    },
                    geometry: { coordinates: [lon, lat] } // GeoJSON is [Lon, Lat]
                };
                renderSearchResults([coordFeature]);
                return; // Skip API call
            }
        }

        // Normal API Search
        debounceTimer = setTimeout(async () => {
            try {
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${userLocation.lat}&lon=${userLocation.lon}&limit=5`;
                const res = await fetch(url);
                const data = await res.json();
                renderSearchResults(data.features);
            } catch (err) { console.error("Search error:", err); }
        }, 300);
    });

    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !resultsList.contains(e.target)) {
            resultsList.classList.add('hidden');
            resultsList.classList.remove('active');
        }
    });
}

function renderSearchResults(features) {
    const resultsList = document.getElementById('searchResults');
    resultsList.innerHTML = '';
    if (!features || features.length === 0) { resultsList.classList.add('hidden'); return; }

    features.forEach(feature => {
        const props = feature.properties;
        const li = document.createElement('li');
        li.className = 'px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 last:border-b-0 text-xs text-slate-200';

        // Handle cases where city/country might be missing (e.g. Coordinate input)
        const subtext = [props.city, props.country].filter(Boolean).join(', ') || "Location";

        li.innerHTML = `<div class="font-medium">${props.name || "Unknown"}</div><div class="text-gray-500">${subtext}</div>`;

        li.addEventListener('click', () => {
            document.getElementById('searchBox').value = props.name || "Selected Location";

            let bbox = props.extent;
            const centerLat = feature.geometry.coordinates[1];
            const centerLon = feature.geometry.coordinates[0];

            const isTiny = !bbox || (Math.abs(bbox[2] - bbox[0]) < 0.005 && Math.abs(bbox[3] - bbox[1]) < 0.005);

            if (isTiny) {
                console.log("Search result too small/point. Expanding to 1.25km context.");
                bbox = calculateBboxFromPoint(centerLat, centerLon, 1250);
            }

            selectedSearchLocation = {
                lat: centerLat,
                lon: centerLon,
                bbox: bbox,
                accuracy: 0
            };

            resultsList.classList.add('hidden');
            resultsList.classList.remove('active');

            const loadBtn = document.getElementById('loadRoadsBtn');
            loadBtn.classList.add('ring-2', 'ring-green-500');
            setTimeout(() => loadBtn.classList.remove('ring-2', 'ring-green-500'), 1000);
        });
        resultsList.appendChild(li);
    });
    resultsList.classList.remove('hidden');
    requestAnimationFrame(() => resultsList.classList.add('active'));
}



function calculateBboxFromPoint(lat, lon, radiusMeters) {
    const R = 6378137;
    const dLat = radiusMeters / R * 180 / Math.PI;
    const dLon = radiusMeters / (R * Math.cos(Math.PI * lat / 180)) * 180 / Math.PI;
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

// --- Geolocation Helper ---
function getPreciseLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation not supported"));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                console.log(`GPS Reading: Accuracy ${pos.coords.accuracy}m`);
                resolve(pos.coords);
            },
            (err) => {
                console.warn("GPS Error:", err);
                reject(err);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

// --- Use Location ---
function setupUseLocationButton() {
    const btn = document.getElementById('useLocationBtn');
    if (!btn) return;

    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const originalContent = btn.innerHTML;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locating...';

        try {
            const coords = await getPreciseLocation();
            const { latitude: lat, longitude: lon, accuracy } = coords;
            const bbox = calculateBboxFromPoint(lat, lon, 1250);

            selectedSearchLocation = { lat, lon, bbox, accuracy };
            document.getElementById('searchBox').value = "My Location";

            btn.innerHTML = originalContent;
            btn.disabled = false;

            document.getElementById('loadRoadsBtn').click();

        } catch (err) {
            showToast("Location access failed: " + err.message, "error");
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    });
}

// --- Infer Routes Logic (Updated for UUID) ---
function setupInferButton() {
    const btn = document.getElementById('inferRoutesBtn');
    btn.addEventListener('click', async () => {
        const pickupCount = nodes.filter(n => n.type === 'pickup').length;
        const survivorCount = nodes.filter(n => n.type === 'survivor').length;

        if (pickupCount < 1 || survivorCount < 1) {
            showToast("Please add at least 1 pickup node and 1 survivor node.", "warning");
            return;
        }
        if (!currentGraphUUID && !selectedSearchLocation) { showToast("Session expired. Please reload.", "error"); return; }

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating...';
        btn.disabled = true;

        const cleanNodes = nodes.map(({ marker, ...rest }) => rest);

        // Construct Bbox from selection for robustness
        const b = selectedSearchLocation.bbox;
        const bboxObj = { north: b[3], south: b[1], east: b[2], west: b[0] };

        const payload = {
            graph_uuid: currentGraphUUID,
            nodes: cleanNodes,
            modified_edges: modifiedEdges,
            start_location: { lat: selectedSearchLocation.lat, lon: selectedSearchLocation.lon }, // Anchor
            bbox: bboxObj
        };

        try {
            const res = await fetch(`${backendUrl}/api/infer-routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                mode: 'cors'
            });

            if (!res.ok) throw new Error(await res.text());

            const geojson = await res.json();
            renderMultiVehicleRoutes(geojson);

        } catch (err) {
            console.error(err);
            showToast("Server Error: " + err.message, "error");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
}

function renderMultiVehicleRoutes(geojson) {
    // 1. Add Source
    if (map.getSource('calculated-routes')) {
        map.getSource('calculated-routes').setData(geojson);
    } else {
        map.addSource('calculated-routes', {
            type: 'geojson',
            data: geojson
        });

        // 2. Add Line Layer
        map.addLayer({
            'id': 'route-lines',
            'type': 'line',
            'source': 'calculated-routes',
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint': {
                'line-width': 6,
                'line-offset': 4, // Separate overlapping paths (outbound/inbound)
                'line-color': [
                    'match',
                    ['%', ['get', 'vehicle_id'], 5],
                    0, '#2563EB', // Blue
                    1, '#9333EA', // Purple
                    2, '#059669', // Green
                    3, '#DB2777', // Pink
                    4, '#D97706', // Amber
                    '#000000'
                ],
                'line-opacity': 0.8
            }
        });

        // 3. Add Arrow Layer
        map.addLayer({
            'id': 'route-arrows',
            'type': 'symbol',
            'source': 'calculated-routes',
            'layout': {
                'symbol-placement': 'line',
                'symbol-spacing': 50, // Less clutter
                'icon-image': 'arrow',
                'icon-size': 0.6,
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-rotation-alignment': 'map',
                'icon-offset': [0, 4] // Match line-offset
            },
            'paint': {
                'icon-color': [
                    'match',
                    ['%', ['get', 'vehicle_id'], 5],
                    0, '#2563EB',
                    1, '#9333EA',
                    2, '#059669',
                    3, '#DB2777',
                    4, '#D97706',
                    '#000000'
                ],
                'icon-halo-color': '#ffffff',
                'icon-halo-width': 2
            }
        });
    }

    // 4. Z-Index Management
    if (map.getLayer('edges-visual')) {
        if (map.getLayer('route-lines')) map.moveLayer('route-lines');
        if (map.getLayer('route-arrows')) map.moveLayer('route-arrows');
    }
}
// --- Map Loading ---
function clearMapState() {
    // 1. Remove Markers from Map
    nodes.forEach(node => {
        if (node.marker) node.marker.remove();
    });

    // 2. Clear Data Arrays
    nodes = [];
    modifiedEdges = [];
    nodeCounter = 0;

    // 3. Clear Routes
    if (map && map.getSource('calculated-routes')) {
        map.getSource('calculated-routes').setData({ type: 'FeatureCollection', features: [] });
    }

    // 4. Remove any stray UI elements
    if (currentPopup) { currentPopup.remove(); currentPopup = null; }
    if (currentEdgePopup) { currentEdgePopup.remove(); currentEdgePopup = null; }
    if (currentTempMarker) { currentTempMarker.remove(); currentTempMarker = null; }
}
function setupLoadMapButton() {
    const btn = document.getElementById('loadRoadsBtn');
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const searchBox = document.getElementById('searchBox');
        if (!searchBox.value.trim()) { showToast("Please enter a location.", "error"); return; }
        if (!selectedSearchLocation) { showToast("Select location first.", "error"); return; }
        if (map) {
            clearMapState();
        }
        document.getElementById('mapPlaceholder').classList.add('hidden');
        document.getElementById('mapLoading').classList.remove('hidden');
        document.getElementById('map').classList.remove('opacity-0');

        if (!map) {
            map = new maplibregl.Map({
                container: 'map',
                style: mapStyle,
                center: [selectedSearchLocation.lon, selectedSearchLocation.lat],
                zoom: 15,
                attributionControl: false
            });

            map.addControl(new maplibregl.NavigationControl());

            // FIX: Generate Arrow Icon Programmatically (No network/decoding errors)
            map.on('load', async () => {
                generateArrowIcon(map); // Generate icon
                await loadDataSequence();
                setupInteractionHandlers();
            });
        } else {
            map.jumpTo({ center: [selectedSearchLocation.lon, selectedSearchLocation.lat], zoom: 15 });
            await loadDataSequence();
        }
    });
}







async function fetchAndRenderGraph() {
    // 1. Prepare Request BBox (The "Search Area")
    let b = selectedSearchLocation.bbox;
    b = [Math.max(-180, b[0]), Math.max(-90, b[1]), Math.min(180, b[2]), Math.min(90, b[3])];
    const bboxPayload = { north: b[3], south: b[1], east: b[2], west: b[0] };

    // Initial fit (approximate)
    // We will refine this AFTER data loads
    // map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 20 }); 

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(`${backendUrl}/api/load-graph`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bboxPayload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.status == 400) {
            alert("Map doesn't have edges");
            return
        }
        if (!res.ok) {
            document.getElementById('mapLoading').classList.add('hidden');
            const text = await res.text();
            throw new Error(text);
        }

        const responseData = await res.json();
        currentGraphUUID = responseData.graph_uuid;
        let edgesGeoJSON = responseData.geojson;
        if (typeof edgesGeoJSON === 'string') edgesGeoJSON = JSON.parse(edgesGeoJSON);

        if (edgesGeoJSON.features.length > 0) {
            const sample = edgesGeoJSON.features[0].properties;
            if (sample.u === undefined || sample.v === undefined) {
                console.error("Backend Data Issue. Sample:", sample);
                showToast("Backend Error: Missing u/v properties.", "error");
                document.getElementById('mapLoading').classList.add('hidden');
                return;
            }
        } else {
            showToast("No roads found in this area.", "error");
            document.getElementById('mapLoading').classList.add('hidden');
            return;
        }

        // Initialization & Bounds Calculation
        const graphBounds = new maplibregl.LngLatBounds(); // Track actual data extent

        edgesGeoJSON.features = edgesGeoJSON.features.map(f => {
            const u = f.properties.u;
            const v = f.properties.v;
            const k = f.properties.key || 0;
            f.id = String(`${u}-${v}-${k}`);
            f.properties.id = f.id;
            if (!f.properties.state) f.properties.state = 'clear';

            // Extend bounds to include this feature
            if (f.geometry && f.geometry.coordinates) {
                f.geometry.coordinates.forEach(coord => graphBounds.extend(coord));
            }
            return f;
        });

        currentGeoJSON = edgesGeoJSON;

        // FIX: Zoom to FIT DATA, not just the search radius
        if (!graphBounds.isEmpty()) {
            // Set Max Bounds relative to the DATA, with a healthy buffer (e.g. ~1km padding)
            const sw = graphBounds.getSouthWest();
            const ne = graphBounds.getNorthEast();
            const pad = 0.01; // ~1.1km buffer

            map.setMaxBounds([
                [sw.lng - pad, sw.lat - pad],
                [ne.lng + pad, ne.lat + pad]
            ]);
        } else {
            // Fallback if no geometry found (rare)
            map.setMaxBounds([[b[0], b[1]], [b[2], b[3]]]);
        }

        if (map.getSource('road-network')) {
            map.getSource('road-network').setData(currentGeoJSON);
        } else {
            map.addSource('road-network', { type: 'geojson', data: currentGeoJSON, promoteId: 'id' });
            map.addLayer({
                'id': 'edges-visual',
                'type': 'line',
                'source': 'road-network',
                'layout': { 'line-join': 'round', 'line-cap': 'round' },
                'paint': {
                    'line-color': [
                        'match',
                        ['get', 'state'],
                        'blocked', '#EF4444',
                        'partial', '#F59E0B',
                        '#10B981'
                    ],
                    'line-width': 3
                }
            });
            map.addLayer({
                'id': 'edges-click-zone',
                'type': 'line',
                'source': 'road-network',
                'paint': { 'line-width': 15, 'line-opacity': 0 }
            });
        }
    } catch (err) {
        console.error(err);
        alert(err.name === 'AbortError' ? "Backend timed out (60s)." : "Error: " + err.message);
    } finally {
        document.getElementById('mapLoading').classList.add('hidden');
    }
}


function generateArrowIcon(mapInstance) {
    const width = 24;
    const height = 24;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Draw Arrow Head
    ctx.fillStyle = '#ffffff'; // White fill
    ctx.strokeStyle = '#000000'; // Black outline
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 6);
    ctx.lineTo(20, 12);
    ctx.lineTo(4, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const imageData = ctx.getImageData(0, 0, width, height);
    if (!mapInstance.hasImage('arrow')) {
        mapInstance.addImage('arrow', imageData, { sdf: true });
        // SDF=true allows us to color it dynamically with icon-color
    }
}

async function loadDataSequence() {
    if (userLocationMarker) userLocationMarker.remove();
    if (map.getLayer('user-accuracy')) map.removeLayer('user-accuracy');
    if (map.getSource('user-accuracy')) map.removeSource('user-accuracy');
    if (map.getLayer('route-arrows')) map.removeLayer('route-arrows');
    if (map.getLayer('route-lines')) map.removeLayer('route-lines');
    if (map.getSource('calculated-routes')) map.removeSource('calculated-routes');

    const el = document.createElement('div');
    el.className = 'w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg z-50';
    userLocationMarker = new maplibregl.Marker({ element: el })
        .setLngLat([selectedSearchLocation.lon, selectedSearchLocation.lat])
        .addTo(map);

    if (selectedSearchLocation.accuracy && selectedSearchLocation.accuracy > 10) {
        const center = [selectedSearchLocation.lon, selectedSearchLocation.lat];
        const radius = selectedSearchLocation.accuracy;
        const circleGeoJSON = createGeoJSONCircle(center, radius / 1000);
        map.addSource('user-accuracy', { type: 'geojson', data: circleGeoJSON });
        map.addLayer({
            id: 'user-accuracy',
            type: 'fill',
            source: 'user-accuracy',
            paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.2, 'fill-outline-color': '#2563eb' }
        });
    }

    await fetchAndRenderGraph();
    document.getElementById('inferRoutesBtn').disabled = false;
    document.getElementById('inferRoutesBtn').classList.remove('opacity-50', 'cursor-not-allowed');
}

function createGeoJSONCircle(center, radiusInKm, points = 64) {
    const coords = { latitude: center[1], longitude: center[0] };
    const km = radiusInKm;
    const ret = [];
    const distanceX = km / (111.320 * Math.cos(coords.latitude * Math.PI / 180));
    const distanceY = km / 110.574;
    let theta, x, y;
    for (let i = 0; i < points; i++) {
        theta = (i / points) * (2 * Math.PI);
        x = distanceX * Math.cos(theta);
        y = distanceY * Math.sin(theta);
        ret.push([coords.longitude + x, coords.latitude + y]);
    }
    ret.push(ret[0]);
    return { type: "Feature", geometry: { type: "Polygon", coordinates: [ret] } };
}



function setupInteractionHandlers() {
    map.on('click', (e) => {
        // 1. Global Modal Check
        if (currentPopup || currentEdgePopup) {
            if (currentPopup) { currentPopup.remove(); currentPopup = null; }
            if (currentEdgePopup) { currentEdgePopup.remove(); currentEdgePopup = null; }
            if (currentTempMarker) { currentTempMarker.remove(); currentTempMarker = null; }
            return;
        }

        const features = map.queryRenderedFeatures(e.point, { layers: ['edges-click-zone'] });
        if (features.length > 0) {
            handleEdgeClick(e, features[0]);
            return;
        }
        handleMapClick(e);
    });
    map.on('mouseenter', 'edges-click-zone', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'edges-click-zone', () => map.getCanvas().style.cursor = '');
}

function handleMapClick(e) {
    if (currentPopup) currentPopup.remove();
    if (currentEdgePopup) currentEdgePopup.remove();
    if (currentTempMarker) { currentTempMarker.remove(); currentTempMarker = null; }

    const { lng, lat } = e.lngLat;
    const el = document.createElement('div');
    el.style.cssText = `width:32px;height:32px;background-image:url(${survivorIconUrl});background-size:contain;filter:hue-rotate(220deg);`;

    currentTempMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);

    currentPopup = new maplibregl.Popup({ closeOnClick: false, anchor: 'bottom', offset: [0, -35], maxWidth: '220px', closeButton: false })
        .setDOMContent(buildNodeForm())
        .setLngLat([lng, lat]).addTo(map);
}

function buildNodeForm() {
    const form = document.createElement('div');
    form.className = 'bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 w-64';
    form.innerHTML = `
        <h3 class="font-bold text-sm mb-3 text-white flex items-center gap-2"><i class="fas fa-map-marker-alt text-blue-500"></i> Add Node</h3>
        
        <div class="mb-3">
            <label class="block text-xs text-slate-400 mb-1 font-medium">Node Type</label>
            <select id="typeSelect" class="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                <option value="survivor">Survivor Group</option>
                <option value="pickup">Pickup Point</option>
            </select>
        </div>

        <div id="survivorFields" class="space-y-3 mb-4">
            <div class="flex gap-3">
                <div class="flex-1">
                    <label class="block text-xs text-slate-400 mb-1 font-medium">Urgency (1-10)</label>
                    <input type="number" id="urgencyInput" value="1" min="1" max="10" class="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                </div>
                <div class="flex-1">
                    <label class="block text-xs text-slate-400 mb-1 font-medium">Count</label>
                    <input type="number" id="countInput" value="1" min="1" class="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                </div>
            </div>
        </div>

        <div class="flex gap-2 pt-2 border-t border-slate-700">
            <button id="saveBtn" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded py-1.5 text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">Save</button>
            <button id="cancelBtn" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded py-1.5 text-sm font-medium transition-colors">Cancel</button>
        </div>
    `;
    const typeSelect = form.querySelector('#typeSelect');
    const fields = form.querySelector('#survivorFields');
    const urgencyInput = form.querySelector('#urgencyInput');
    typeSelect.addEventListener('change', () => fields.style.display = typeSelect.value === 'survivor' ? 'block' : 'none');

    form.querySelector('#saveBtn').addEventListener('click', () => {
        const type = typeSelect.value;
        const urgency = parseInt(urgencyInput.value);
        const count = parseInt(form.querySelector('#countInput').value);
        const { lng, lat } = currentTempMarker.getLngLat();

        const id = ++nodeCounter;
        const icon = type === 'survivor' ? survivorIconUrl : pickupIconUrl;
        const el = document.createElement('div');
        el.style.cssText = `width:32px;height:32px;background-image:url(${icon});background-size:contain;cursor:pointer;`; // cursor:pointer

        const finalMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);

        // Create Node Object (Includes Marker Ref for UI, will be stripped for Backend)
        const nodeData = { id, x: lng, y: lat, type, urgency, count, marker: finalMarker };
        nodes.push(nodeData);

        // FIX: Add Click Handler to Finalized Marker
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent map click handlers
            openNodeInfoModal(nodeData);
        });

        currentTempMarker.remove(); currentPopup.remove(); currentTempMarker = null; currentPopup = null;
    });

    form.querySelector('#cancelBtn').addEventListener('click', () => {
        currentTempMarker.remove();
        currentTempMarker = null;
        currentPopup.remove();
        currentPopup = null;
    });
    return form;
}

function openNodeInfoModal(nodeData) {
    // FIX: Clean up ALL previous state before opening this modal
    if (currentPopup) { currentPopup.remove(); currentPopup = null; }
    if (currentEdgePopup) { currentEdgePopup.remove(); currentEdgePopup = null; }

    // FIX: Remove the "Dummy" (Temporary) marker if the user was in the middle of placing one
    if (currentTempMarker) {
        currentTempMarker.remove();
        currentTempMarker = null;
    }

    const content = document.createElement('div');
    content.className = 'bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 w-64';

    const typeLabel = nodeData.type === 'survivor' ? 'Survivor Group' : 'Pickup Point';
    const iconClass = nodeData.type === 'survivor' ? 'fa-user-injured text-red-500' : 'fa-helicopter text-emerald-500';

    const detailsHtml = nodeData.type === 'survivor'
        ? `<div class="grid grid-cols-2 gap-2 mb-3 text-xs">
             <div class="bg-slate-800 p-2 rounded border border-slate-700">
               <span class="block text-slate-400 mb-0.5">Urgency</span>
               <span class="font-bold text-white">${nodeData.urgency}/10</span>
             </div>
             <div class="bg-slate-800 p-2 rounded border border-slate-700">
               <span class="block text-slate-400 mb-0.5">Count</span>
               <span class="font-bold text-white">${nodeData.count}</span>
             </div>
           </div>`
        : `<div class="mb-3 text-xs text-slate-400 italic">Safe extraction zone</div>`;

    content.innerHTML = `
        <h3 class="font-bold text-sm mb-3 text-white flex items-center gap-2">
            <i class="fas ${iconClass}"></i> ${typeLabel}
        </h3>
        ${detailsHtml}
        <div class="flex gap-2 pt-2 border-t border-slate-700">
            <button id="deleteNodeBtn" class="flex-1 bg-red-600 hover:bg-red-500 text-white rounded py-1.5 text-sm font-medium transition-colors shadow-lg shadow-red-500/20">Delete</button>
            <button id="closeNodeBtn" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded py-1.5 text-sm font-medium transition-colors">Close</button>
        </div>
    `;

    content.querySelector('#deleteNodeBtn').addEventListener('click', () => {
        nodeData.marker.remove();
        nodes = nodes.filter(n => n.id !== nodeData.id);
        currentPopup.remove();
        currentPopup = null;
    });

    content.querySelector('#closeNodeBtn').addEventListener('click', () => {
        currentPopup.remove();
        currentPopup = null;
    });

    currentPopup = new maplibregl.Popup({
        closeOnClick: false,
        anchor: 'bottom',
        offset: [0, -35],
        maxWidth: '300px',
        closeButton: false,
        className: 'dark-popup' // Custom class for further CSS overrides if needed
    })
        .setLngLat([nodeData.x, nodeData.y])
        .setDOMContent(content)
        .addTo(map);
}

function handleEdgeClick(e, feature) {
    // Ensure map is clear (should be handled by map click, but safe to keep)
    if (currentTempMarker) { currentTempMarker.remove(); currentTempMarker = null; }
    if (currentPopup) { currentPopup.remove(); currentPopup = null; }
    if (currentEdgePopup) { currentEdgePopup.remove(); currentEdgePopup = null; }

    currentEdgePopup = new maplibregl.Popup({ closeOnClick: true, closeButton: false, anchor: 'bottom', maxWidth: '240px', offset: [0, -10] })
        .setLngLat(e.lngLat)
        .setDOMContent(buildEdgeForm(feature))
        .addTo(map);
}

function buildEdgeForm(feature) {
    const p = feature.properties;
    const clickedId = String(feature.id || p.id);
    const streetName = p.name || "Unnamed Road";
    let idx = currentGeoJSON.features.findIndex(f => String(f.id) === clickedId);
    if (idx === -1) {
        idx = currentGeoJSON.features.findIndex(f => String(f.properties.u) === String(p.u) && String(f.properties.v) === String(p.v) && String(f.properties.key || 0) === String(p.key || 0));
    }
    const currentStatus = idx !== -1 ? currentGeoJSON.features[idx].properties.state : 'clear';

    const form = document.createElement('div');
    form.className = 'bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 w-72';

    // FIX: Added Cancel Button
    form.innerHTML = `
        <h3 class="font-bold text-sm mb-3 text-white flex items-center gap-2"><i class="fas fa-road text-blue-500"></i> Edit Road Status</h3>
        
        <div class="mb-3 bg-slate-800 p-2 rounded border border-slate-700">
            <div class="text-xs font-semibold text-slate-300 truncate" title="${streetName}">
                <i class="fas fa-map-pin mr-1 text-slate-500"></i> ${streetName}
            </div>
        </div>

        <div class="mb-3">
            <label class="block text-xs text-slate-400 mb-1 font-medium">Condition</label>
            <select id="edgeStatus" class="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500 transition-colors">
                <option value="clear" ${currentStatus === 'clear' ? 'selected' : ''}>🟢 Clear</option>
                <option value="partial" ${currentStatus === 'partial' ? 'selected' : ''}>🟡 Partial Obstruction</option>
                <option value="blocked" ${currentStatus === 'blocked' ? 'selected' : ''}>🔴 Blocked (Impassable)</option>
            </select>
        </div>

        <div class="flex items-center mb-4 bg-slate-800/50 p-2 rounded">
            <input type="checkbox" id="applyToStreet" class="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer">
            <label for="applyToStreet" class="ml-2 text-xs text-slate-300 cursor-pointer select-none">
                Apply to entire <b>"${streetName}"</b>
            </label>
        </div>

        <div class="flex gap-2 pt-2 border-t border-slate-700">
            <button id="saveEdgeBtn" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded py-1.5 text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">Update</button>
            <button id="cancelEdgeBtn" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded py-1.5 text-sm font-medium transition-colors">Cancel</button>
        </div>
    `;

    form.querySelector('#saveEdgeBtn').addEventListener('click', () => {
        if (idx === -1) { showToast("Cannot find edge in local data.", "error"); currentEdgePopup.remove(); return; }
        const status = form.querySelector('#edgeStatus').value;
        const applyToAll = form.querySelector('#applyToStreet').checked;
        let edgesToUpdate = [];
        if (applyToAll && p.name) {
            currentGeoJSON.features.forEach((f, i) => { if (f.properties.name === p.name) edgesToUpdate.push({ index: i, feature: f }); });
        } else {
            edgesToUpdate.push({ index: idx, feature: currentGeoJSON.features[idx] });
        }
        edgesToUpdate.forEach(item => {
            const f = item.feature;
            f.properties.state = status;
            const eId = f.id;
            const modIdx = modifiedEdges.findIndex(e => String(e.id) === String(eId));
            const modObj = { id: eId, u: f.properties.u, v: f.properties.v, key: f.properties.key || 0, state: status };
            if (modIdx !== -1) { modifiedEdges[modIdx] = modObj; } else { modifiedEdges.push(modObj); }
        });
        map.getSource('road-network').setData(currentGeoJSON);
        currentEdgePopup.remove();
        currentEdgePopup = null;
    });

    // Cancel Handler
    form.querySelector('#cancelEdgeBtn').addEventListener('click', () => {
        currentEdgePopup.remove();
        currentEdgePopup = null;
    });

    return form;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transform transition-all duration-300 translate-x-full opacity-0`;

    let bgClass, borderClass, iconClass;
    if (type === 'error') {
        bgClass = 'bg-red-900/90 text-red-100';
        borderClass = 'border-red-700';
        iconClass = 'fa-exclamation-circle text-red-400';
    } else if (type === 'success') {
        bgClass = 'bg-emerald-900/90 text-emerald-100';
        borderClass = 'border-emerald-700';
        iconClass = 'fa-check-circle text-emerald-400';
    } else if (type === 'warning') {
        bgClass = 'bg-amber-900/90 text-amber-100';
        borderClass = 'border-amber-700';
        iconClass = 'fa-exclamation-triangle text-amber-400';
    } else {
        bgClass = 'bg-slate-800/90 text-slate-100';
        borderClass = 'border-slate-600';
        iconClass = 'fa-info-circle text-blue-400';
    }

    toast.classList.add(...bgClass.split(' '), ...borderClass.split(' '));

    toast.innerHTML = `
        <i class="fas ${iconClass} text-lg"></i>
        <span class="text-sm font-medium">${message}</span>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    // Remove after 4s
    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
