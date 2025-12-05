import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapIcon, Search, Locate, Download, Route as RouteIcon, Info, Loader2, Satellite, AlertCircle } from 'lucide-react';
import { createRoot } from 'react-dom/client';

const pickupIconUrl = 'https://cdn-icons-png.flaticon.com/512/190/190411.png';
const survivorIconUrl = 'https://cdn-icons-png.flaticon.com/512/684/684908.png';

export default function RoutePlanner() {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const geoJsonRef = useRef(null); // Store the full GeoJSON for reference
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [loadingMap, setLoadingMap] = useState(false);
    const [inferring, setInferring] = useState(false);

    // State for logic
    const nodesRef = useRef([]); // Use ref to avoid closure staleness in map callbacks
    const modifiedEdgesRef = useRef([]); // Track modified edges for backend
    const currentGraphUUID = useRef(null);
    const userLocation = useRef({ lat: 30.0444, lon: 31.2357 });
    const ignoreSearchRef = useRef(false);
    const justClosedPopup = useRef(false);
    const [nodeCounts, setNodeCounts] = useState({ survivor: 0, pickup: 0 });

    // UI State
    const [toast, setToast] = useState(null);

    useEffect(() => {
        // Set RTL Text Plugin
        if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
            maplibregl.setRTLTextPlugin(
                'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.min.js',
                null,
                true // Lazy load the plugin
            );
        }

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    userLocation.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                },
                (err) => console.warn("Geolocation denied.", err),
                { enableHighAccuracy: true }
            );
        }
    }, []);

    // Map Cleanup
    useEffect(() => {
        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Search Logic
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (ignoreSearchRef.current) {
                ignoreSearchRef.current = false;
                return;
            }

            if (searchQuery.length < 3) {
                setSearchResults([]);
                return;
            }

            // Coordinate check
            const coordMatch = searchQuery.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
            if (coordMatch) {
                const lat = parseFloat(coordMatch[1]);
                const lon = parseFloat(coordMatch[3]);
                if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                    setSearchResults([{
                        properties: {
                            name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
                            city: "Jump to Coordinates",
                            country: "GPS Direct Input"
                        },
                        geometry: { coordinates: [lon, lat] }
                    }]);
                    return;
                }
            }

            try {
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&lat=${userLocation.current.lat}&lon=${userLocation.current.lon}&limit=5`;
                const res = await fetch(url);
                const data = await res.json();
                setSearchResults(data.features);
            } catch (err) {
                console.error("Search error:", err);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const handleSelectLocation = (feature) => {
        ignoreSearchRef.current = true;
        setSearchQuery(feature.properties.name || "Selected Location");
        setSearchResults([]);

        let bbox = feature.properties.extent;
        const centerLat = feature.geometry.coordinates[1];
        const centerLon = feature.geometry.coordinates[0];

        const isTiny = !bbox || (Math.abs(bbox[2] - bbox[0]) < 0.005 && Math.abs(bbox[3] - bbox[1]) < 0.005);
        if (isTiny) {
            bbox = calculateBboxFromPoint(centerLat, centerLon, 1250);
        }

        setSelectedLocation({
            lat: centerLat,
            lon: centerLon,
            bbox: bbox,
            accuracy: 0
        });
    };

    const handleUseLocation = () => {
        if (!navigator.geolocation) {
            showToast("Geolocation not supported", "error");
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude: lat, longitude: lon, accuracy } = pos.coords;
                const bbox = calculateBboxFromPoint(lat, lon, 1250);
                const newLocation = { lat, lon, bbox, accuracy };

                setSelectedLocation(newLocation);

                ignoreSearchRef.current = true;
                setSearchQuery("My Location");
                setSearchResults([]);

                // Auto-load map data
                loadMapData(newLocation);
            },
            (err) => showToast("Location access failed: " + err.message, "error"),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const loadMapData = async (locationOverride = null) => {
        const loc = locationOverride || selectedLocation;

        if (!loc) {
            showToast("Select location first.", "error");
            return;
        }

        setLoadingMap(true);

        try {
            // Initialize Map if it doesn't exist
            if (!map.current) {
                map.current = new maplibregl.Map({
                    container: mapContainer.current,
                    style: 'https://tiles.openfreemap.org/styles/liberty',
                    center: [loc.lon, loc.lat],
                    zoom: 14,
                    attributionControl: false // Remove attribution
                });

                await new Promise(resolve => {
                    if (map.current.loaded()) resolve();
                    else map.current.on('load', resolve);
                });

                generateArrowIcon(map.current);
                setupInteractionHandlers();
            } else {
                map.current.flyTo({ center: [loc.lon, loc.lat], zoom: 14 });
            }

            // Strict check: If map was destroyed during init, abort.
            if (!map.current) return;

            // FIX: Clear existing nodes and routes when loading/reloading map data
            if (nodesRef.current) {
                nodesRef.current.forEach(n => n.marker.remove());
                nodesRef.current = [];
            }
            modifiedEdgesRef.current = [];
            setNodeCounts({ survivor: 0, pickup: 0 });

            const m = map.current;
            if (m.getLayer('route-lines')) m.removeLayer('route-lines');
            if (m.getLayer('route-arrows')) m.removeLayer('route-arrows');
            if (m.getSource('route')) m.removeSource('route');

            let b = loc.bbox;
            b = [Math.max(-180, b[0]), Math.max(-90, b[1]), Math.min(180, b[2]), Math.min(90, b[3])];
            const bboxPayload = { north: b[3], south: b[1], east: b[2], west: b[0] };

            // FIX: Zoom to FIT DATA, not just the search radius
            // We will refine this AFTER data loads


            const backendUrl = `http://${window.location.hostname}:8000`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const res = await fetch(`${backendUrl}/api/load-graph`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bboxPayload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(await res.text());

            const responseData = await res.json();

            // Strict check: If map was destroyed during fetch, abort.
            if (!map.current) return;

            currentGraphUUID.current = responseData.graph_uuid;
            let edgesGeoJSON = responseData.geojson;
            if (typeof edgesGeoJSON === 'string') edgesGeoJSON = JSON.parse(edgesGeoJSON);

            // Store in ref for updates
            geoJsonRef.current = edgesGeoJSON;

            if (edgesGeoJSON.features.length === 0) {
                showToast("No roads found in this area.", "error");
                setLoadingMap(false);
                return;
            }

            // Preprocess Features (Match route.js logic)
            edgesGeoJSON.features = edgesGeoJSON.features.map(f => {
                const u = f.properties.u;
                const v = f.properties.v;
                const k = f.properties.key || 0;
                f.id = String(`${u}-${v}-${k}`);
                f.properties.id = f.id;
                if (!f.properties.state) f.properties.state = 'clear';
                return f;
            });

            // Render Graph
            renderGraph(edgesGeoJSON);

            // Add User Location Marker
            if (map.current) {
                new maplibregl.Marker({
                    element: createMarkerElement('w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg z-50')
                })
                    .setLngLat([loc.lon, loc.lat])
                    .addTo(map.current);
            }

            setMapLoaded(true);

        } catch (err) {
            console.error(err);
            showToast("Error loading map: " + err.message, "error");
        } finally {
            if (map.current) {
                setLoadingMap(false);
            }
        }
    };

    const renderGraph = (geojson) => {
        const m = map.current;
        if (!m) return;
        if (m.getSource('road-network')) {
            m.getSource('road-network').setData(geojson);
        } else {
            m.addSource('road-network', { type: 'geojson', data: geojson, promoteId: 'id' });
            m.addLayer({
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
            m.addLayer({
                'id': 'edges-click-zone',
                'type': 'line',
                'source': 'road-network',
                'paint': { 'line-width': 15, 'line-opacity': 0 }
            });
        }

        // Fit bounds
        const bounds = new maplibregl.LngLatBounds();
        geojson.features.forEach(f => {
            f.geometry.coordinates.forEach(c => bounds.extend(c));
        });
        if (!bounds.isEmpty()) {
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            const pad = 0.01; // ~1.1km buffer

            m.setMaxBounds([
                [sw.lng - pad, sw.lat - pad],
                [ne.lng + pad, ne.lat + pad]
            ]);

            // Restore fitBounds to match route.js behavior
            m.fitBounds(bounds, { padding: 20 });
        } else {
            // Fallback
            m.setMaxBounds(null);
        }
    };

    const activePopup = useRef(null); // Track active popup for manual dismissal

    const clearMapState = () => {
        const m = map.current;
        if (!m) return;

        // Clear layers
        if (m.getLayer('edges-visual')) m.removeLayer('edges-visual');
        if (m.getLayer('edges-click-zone')) m.removeLayer('edges-click-zone');
        if (m.getLayer('route-lines')) m.removeLayer('route-lines');
        if (m.getLayer('route-arrows')) m.removeLayer('route-arrows');

        // Clear sources
        if (m.getSource('road-network')) m.removeSource('road-network');
        if (m.getSource('route')) m.removeSource('route');

        // Clear nodes
        nodesRef.current.forEach(n => n.marker.remove());
        nodesRef.current = [];
        modifiedEdgesRef.current = [];
        setNodeCounts({ survivor: 0, pickup: 0 });
    }

    const inferRoutes = async () => {
        if (nodeCounts.survivor === 0 || nodeCounts.pickup === 0) {
            showToast("Add at least one survivor and one pickup point.", "warning");
            return;
        }

        setInferring(true);
        try {
            // Prepare payload
            const m = map.current;
            if (!m) return; // Safety check

            // Extract modified edges from Ref (matches route.js logic)
            const modifiedEdges = modifiedEdgesRef.current;

            const payload = {
                graph_uuid: currentGraphUUID.current,
                nodes: nodesRef.current.map(n => ({
                    id: n.id,
                    type: n.type,
                    x: n.x,
                    y: n.y,
                    urgency: n.urgency || 1,
                    count: n.count || 1
                })),
                modified_edges: modifiedEdges,
                start_location: { lat: selectedLocation.lat, lon: selectedLocation.lon },
                bbox: {
                    north: selectedLocation.bbox[3],
                    south: selectedLocation.bbox[1],
                    east: selectedLocation.bbox[2],
                    west: selectedLocation.bbox[0]
                }
            };

            const backendUrl = `http://${window.location.hostname}:8000`;
            const res = await fetch(`${backendUrl}/api/infer-routes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(await res.text());

            const data = await res.json();

            // Strict check: Map might be destroyed during await
            if (!map.current) return;
            const currentMap = map.current;

            // Force regeneration of arrow icon to ensure it exists and is correct
            generateArrowIcon(currentMap);

            // Render Route
            if (currentMap.getSource('route')) {
                currentMap.getSource('route').setData(data);
            } else {
                currentMap.addSource('route', { type: 'geojson', data: data });

                // 1. Route Lines
                currentMap.addLayer({
                    'id': 'route-lines',
                    'type': 'line',
                    'source': 'route',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-width': 6,
                        'line-offset': 4,
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

                // 2. Route Arrows
                currentMap.addLayer({
                    'id': 'route-arrows',
                    'type': 'symbol',
                    'source': 'route',
                    'layout': {
                        'symbol-placement': 'line',
                        'symbol-spacing': 50,
                        'icon-image': 'route-arrow-icon',
                        'icon-size': 0.6,
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'icon-rotation-alignment': 'auto',
                        'icon-offset': [0, 4]
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

            // Z-Index Management
            if (currentMap.getLayer('edges-visual')) {
                if (currentMap.getLayer('route-lines')) currentMap.moveLayer('route-lines');
                if (currentMap.getLayer('route-arrows')) currentMap.moveLayer('route-arrows');
            }

            setInferring(false);
        } catch (err) {
            console.error(err);
            showToast("Error calculating routes: " + err.message, "error");
            setInferring(false);
        }
    };

    const setupInteractionHandlers = () => {
        const m = map.current;
        m.on('click', (e) => {
            // Check if clicking on an edge
            const features = m.queryRenderedFeatures(e.point, { layers: ['edges-click-zone'] });
            if (features.length > 0) {
                handleEdgeClick(e, features[0]);
            } else {
                handleMapClick(e);
            }
        });
        m.on('mouseenter', 'edges-click-zone', () => m.getCanvas().style.cursor = 'pointer');
        m.on('mouseleave', 'edges-click-zone', () => m.getCanvas().style.cursor = '');
    };

    const handleMapClick = (e) => {
        // Strict Modal Dismissal: If a popup is open, close it and DO NOT create a new node.
        if (activePopup.current) {
            activePopup.current.remove();
            activePopup.current = null;
            return;
        }

        const { lng, lat } = e.lngLat;

        // Create temp marker and popup
        const el = document.createElement('div');
        el.style.cssText = `width:32px;height:32px;background-image:url(${survivorIconUrl});background-size:contain;filter:hue-rotate(220deg);`;
        const tempMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map.current);

        const popupDiv = document.createElement('div');
        // closeOnClick: false to manually handle dismissal in handleMapClick
        const popup = new maplibregl.Popup({ closeOnClick: false, anchor: 'bottom', offset: [0, -35], maxWidth: '250px', closeButton: false })
            .setDOMContent(popupDiv)
            .setLngLat([lng, lat])
            .addTo(map.current);

        activePopup.current = popup;

        popup.on('close', () => {
            tempMarker.remove();
            if (activePopup.current === popup) {
                activePopup.current = null;
            }
        });

        const root = createRoot(popupDiv);
        root.render(
            <NodePopup
                onSave={(data) => {
                    addNode(lng, lat, data);
                    popup.remove();
                }}
                onCancel={() => {
                    popup.remove();
                }}
            />
        );
    };
    const handleEdgeClick = (e, feature) => {
        if (activePopup.current) {
            activePopup.current.remove();
            activePopup.current = null;
            return;
        }

        const edgeId = feature.properties.id;
        const { lng, lat } = e.lngLat;

        const popupDiv = document.createElement('div');
        const popup = new maplibregl.Popup({ closeOnClick: false, anchor: 'bottom', maxWidth: '300px', closeButton: false })
            .setDOMContent(popupDiv)
            .setLngLat([lng, lat])
            .addTo(map.current);

        activePopup.current = popup;

        popup.on('close', () => {
            if (activePopup.current === popup) {
                activePopup.current = null;
            }
        });

        const root = createRoot(popupDiv);
        root.render(
            <EdgePopup
                data={feature.properties}
                onUpdate={(newState, applyToWholeStreet) => {
                    updateEdgeState(edgeId, newState, applyToWholeStreet);
                    popup.remove();
                }}
                onClose={() => popup.remove()}
            />
        );
    };

    const updateEdgeState = (edgeId, newState, applyToWholeStreet = false) => {
        const m = map.current;
        if (!m) return;
        const source = m.getSource('road-network');

        // Use the ref as the source of truth
        if (source && geoJsonRef.current) {
            const data = geoJsonRef.current;

            if (applyToWholeStreet) {
                // Find the target edge to get its name/ref
                const targetEdge = data.features.find(f => f.properties.id === edgeId);
                if (targetEdge && targetEdge.properties.name) {
                    const targetName = targetEdge.properties.name;
                    // Update all edges with the same name
                    data.features.forEach(f => {
                        if (f.properties.name === targetName) {
                            f.properties.state = newState;
                            trackEdgeModification(f, newState);
                        }
                    });
                    showToast(`Updated all segments for "${targetName}"`, "success");
                } else {
                    // Fallback if no name, just update single
                    const feature = data.features.find(f => f.properties.id === edgeId);
                    if (feature) {
                        feature.properties.state = newState;
                        trackEdgeModification(feature, newState);
                    }
                }
            } else {
                // Single update
                const feature = data.features.find(f => f.properties.id === edgeId);
                if (feature) {
                    feature.properties.state = newState;
                    trackEdgeModification(feature, newState);
                }
            }

            // Update the map source
            source.setData(data);
        }
    };

    const trackEdgeModification = (feature, newState) => {
        const modObj = {
            u: feature.properties.u,
            v: feature.properties.v,
            key: feature.properties.key || 0,
            state: newState
        };
        // Check if already modified
        const existingIdx = modifiedEdgesRef.current.findIndex(e =>
            e.u === modObj.u && e.v === modObj.v && e.key === modObj.key
        );

        if (existingIdx !== -1) {
            modifiedEdgesRef.current[existingIdx] = modObj;
        } else {
            modifiedEdgesRef.current.push(modObj);
        }
    };

    const addNode = (lng, lat, data) => {
        const id = Date.now();
        const icon = data.type === 'survivor' ? survivorIconUrl : pickupIconUrl;
        const el = document.createElement('div');
        el.style.cssText = `width:32px;height:32px;background-image:url(${icon});background-size:contain;cursor:pointer;`;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map.current);

        const nodeData = { id, x: lng, y: lat, ...data, marker };
        nodesRef.current.push(nodeData);
        setNodeCounts(prev => ({ ...prev, [data.type]: prev[data.type] + 1 }));

        el.addEventListener('click', (e) => {
            e.stopPropagation();

            if (activePopup.current) {
                activePopup.current.remove();
                activePopup.current = null;
            }

            // Open info popup
            const popupDiv = document.createElement('div');
            const popup = new maplibregl.Popup({ closeOnClick: false, anchor: 'bottom', offset: [0, -35], maxWidth: '250px', closeButton: false })
                .setDOMContent(popupDiv)
                .setLngLat([lng, lat])
                .addTo(map.current);

            activePopup.current = popup;

            popup.on('close', () => {
                if (activePopup.current === popup) {
                    activePopup.current = null;
                }
            });

            const root = createRoot(popupDiv);
            root.render(
                <NodeInfoPopup
                    data={nodeData}
                    onDelete={() => {
                        marker.remove();
                        nodesRef.current = nodesRef.current.filter(n => n.id !== id);
                        setNodeCounts(prev => ({ ...prev, [data.type]: prev[data.type] - 1 }));
                        popup.remove();
                    }}
                    onClose={() => popup.remove()}
                />
            );
        });
    };

    const showToast = (msg, type) => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    return (
        <main className="flex-grow flex flex-row w-full h-full overflow-hidden relative pt-20">
            {/* Sidebar */}
            <aside className="w-80 flex-none bg-slate-900/50 backdrop-blur-sm border-r border-slate-800 p-4 flex flex-col gap-4 z-30 overflow-y-auto">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-1">
                        <MapIcon className="text-blue-500 w-5 h-5" /> Mission Map
                    </h2>
                    <p className="text-xs text-slate-400">Plan and optimize rescue routes.</p>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Target Area</label>
                    <div className="relative w-full group">
                        <div className="flex shadow-lg shadow-black/20 rounded-lg">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search location..."
                                className="px-4 py-2.5 w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            />
                        </div>
                        {searchResults.length > 0 && (
                            <ul className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto text-sm">
                                {searchResults.map((feature, i) => (
                                    <li key={i} onClick={() => handleSelectLocation(feature)} className="px-4 py-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 last:border-b-0 text-xs text-slate-200">
                                        <div className="font-medium">{feature.properties.name}</div>
                                        <div className="text-gray-500">{feature.properties.city}, {feature.properties.country}</div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <button onClick={handleUseLocation} className="w-full bg-slate-800 text-slate-300 px-4 py-2.5 rounded-lg font-medium shadow hover:bg-slate-700 hover:text-white transition flex items-center justify-center gap-2 text-sm border border-slate-700">
                        <Locate className="w-4 h-4" /> Use My Location
                    </button>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-800">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</label>
                    <button onClick={() => loadMapData()} disabled={loadingMap} className="w-full bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                        {loadingMap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Load Map Data
                    </button>
                    <button onClick={inferRoutes} disabled={inferring || !mapLoaded || nodeCounts.survivor === 0 || nodeCounts.pickup === 0} className="w-full bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                        {inferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RouteIcon className="w-4 h-4" />} Calculate Routes
                    </button>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-800 text-xs text-slate-500">
                    <p className="mb-2"><Info className="w-3 h-3 inline mr-1" /> <b>Instructions:</b></p>
                    <ol className="list-decimal list-inside space-y-1 ml-1">
                        <li>Search or select location.</li>
                        <li>Load map data.</li>
                        <li>Click map to add nodes.</li>
                        <li>Click roads to edit status.</li>
                        <li>Calculate routes.</li>
                    </ol>
                </div>
            </aside>

            {/* Map */}
            <div className="flex-grow relative h-full bg-slate-900">
                {!mapLoaded && !loadingMap && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 z-10 bg-slate-900">
                        <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mb-4 animate-pulse">
                            <MapIcon className="text-5xl text-slate-600 w-12 h-12" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-300 mb-2">Map Area Not Loaded</h3>
                        <p className="text-sm text-slate-500 max-w-xs text-center">Use the sidebar controls to select a location and load the map data.</p>
                    </div>
                )}

                {loadingMap && (
                    <div className="absolute inset-0 bg-slate-900/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                        <div className="relative mb-4">
                            <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Satellite className="text-blue-500 w-6 h-6" />
                            </div>
                        </div>
                        <span className="text-white font-semibold text-lg tracking-wide">Downloading Graph Data...</span>
                    </div>
                )}

                <div ref={mapContainer} className={`w-full h-full outline-none ${!mapLoaded && !loadingMap ? 'opacity-0' : 'opacity-100'}`} />
            </div>

            {toast && (
                <div className={`absolute top-24 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border backdrop-blur-md animate-in slide-in-from-top-5 fade-in duration-300 ${toast.type === 'error' ? 'bg-red-950/90 border-red-800 text-red-200' :
                    toast.type === 'warning' ? 'bg-amber-950/90 border-amber-800 text-amber-200' :
                        'bg-slate-900/90 border-slate-700 text-slate-200'
                    }`}>
                    {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                    {toast.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500" />}
                    {!['error', 'warning'].includes(toast.type) && <Info className="w-5 h-5 text-blue-500" />}
                    <span className="text-sm font-medium">{toast.msg}</span>
                </div>
            )}
        </main>
    );
}

// Helper Components
function EdgePopup({ data, onUpdate, onClose }) {
    const [applyToWholeStreet, setApplyToWholeStreet] = useState(false);

    return (
        <div className="bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 w-64">
            <h3 className="font-bold text-sm mb-3 text-white flex items-center gap-2"><RouteIcon className="text-blue-500 w-4 h-4" /> Edit Road Status</h3>
            <div className="mb-3">
                <div className="text-xs text-slate-400 mb-2">
                    Road: <span className="font-mono text-slate-300">{data.name || "Unnamed"}</span>
                    <br />
                    ID: <span className="font-mono text-slate-500 text-[10px]">{data.id}</span>
                </div>

                <div className="mb-3 flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-700">
                    <input
                        type="checkbox"
                        id="wholeStreet"
                        checked={applyToWholeStreet}
                        onChange={(e) => setApplyToWholeStreet(e.target.checked)}
                        className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="wholeStreet" className="text-xs text-slate-300 cursor-pointer select-none">
                        Apply to whole street
                    </label>
                </div>

                <div className="space-y-2">
                    <button onClick={() => onUpdate('clear', applyToWholeStreet)} className={`w-full text-left px-3 py-2 rounded text-xs font-medium border transition ${data.state === 'clear' || !data.state ? 'bg-emerald-900/50 border-emerald-500 text-emerald-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            Clear / Normal
                        </div>
                    </button>
                    <button onClick={() => onUpdate('partial', applyToWholeStreet)} className={`w-full text-left px-3 py-2 rounded text-xs font-medium border transition ${data.state === 'partial' ? 'bg-amber-900/50 border-amber-500 text-amber-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            Partially Blocked
                        </div>
                    </button>
                    <button onClick={() => onUpdate('blocked', applyToWholeStreet)} className={`w-full text-left px-3 py-2 rounded text-xs font-medium border transition ${data.state === 'blocked' ? 'bg-red-900/50 border-red-500 text-red-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            Fully Blocked
                        </div>
                    </button>
                </div>
            </div>
            <div className="pt-2 border-t border-slate-700">
                <button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 rounded py-1.5 text-sm font-medium">Close</button>
            </div>
        </div>
    );
}

function NodePopup({ onSave, onCancel }) {
    const [type, setType] = useState('survivor');
    const [urgency, setUrgency] = useState(1);
    const [count, setCount] = useState(1);

    return (
        <div className="bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 w-64">
            <h3 className="font-bold text-sm mb-3 text-white flex items-center gap-2"><MapIcon className="text-blue-500 w-4 h-4" /> Add Node</h3>
            <div className="mb-3">
                <label className="block text-xs text-slate-400 mb-1 font-medium">Node Type</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-blue-500">
                    <option value="survivor" className="bg-slate-800 text-white">Survivor Group</option>
                    <option value="pickup" className="bg-slate-800 text-white">Pickup Point</option>
                </select>
            </div>
            {type === 'survivor' && (
                <div className="flex gap-3 mb-4">
                    <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1 font-medium">Urgency</label>
                        <div className="flex items-center bg-slate-800 border border-slate-600 rounded">
                            <button
                                onClick={() => setUrgency(Math.max(1, urgency - 1))}
                                className="px-2 py-1 text-slate-400 hover:text-white border-r border-slate-600"
                            >-</button>
                            <input
                                type="number"
                                value={urgency}
                                onChange={(e) => setUrgency(parseInt(e.target.value) || 1)}
                                min="1"
                                max="10"
                                className="w-full p-1 bg-transparent text-center text-sm text-white focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                                onClick={() => setUrgency(Math.min(10, urgency + 1))}
                                className="px-2 py-1 text-slate-400 hover:text-white border-l border-slate-600"
                            >+</button>
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-1 font-medium">Count</label>
                        <div className="flex items-center bg-slate-800 border border-slate-600 rounded">
                            <button
                                onClick={() => setCount(Math.max(1, count - 1))}
                                className="px-2 py-1 text-slate-400 hover:text-white border-r border-slate-600"
                            >-</button>
                            <input
                                type="number"
                                value={count}
                                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                                min="1"
                                className="w-full p-1 bg-transparent text-center text-sm text-white focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                                onClick={() => setCount(count + 1)}
                                className="px-2 py-1 text-slate-400 hover:text-white border-l border-slate-600"
                            >+</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex gap-2 pt-2 border-t border-slate-700">
                <button onClick={() => onSave({ type, urgency, count })} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded py-1.5 text-sm font-medium">Save</button>
                <button onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded py-1.5 text-sm font-medium">Cancel</button>
            </div>
        </div>
    );
}

function NodeInfoPopup({ data, onDelete, onClose }) {
    return (
        <div className="bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-700 w-64">
            <h3 className="font-bold text-sm mb-3 text-white flex items-center gap-2">
                {data.type === 'survivor' ? 'Survivor Group' : 'Pickup Point'}
            </h3>
            {data.type === 'survivor' ? (
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div className="bg-slate-800 p-2 rounded border border-slate-700">
                        <span className="block text-slate-400 mb-0.5">Urgency</span>
                        <span className="font-bold text-white">{data.urgency}/10</span>
                    </div>
                    <div className="bg-slate-800 p-2 rounded border border-slate-700">
                        <span className="block text-slate-400 mb-0.5">Count</span>
                        <span className="font-bold text-white">{data.count}</span>
                    </div>
                </div>
            ) : (
                <div className="mb-3 text-xs text-slate-400 italic">Safe extraction zone</div>
            )}
            <div className="flex gap-2 pt-2 border-t border-slate-700">
                <button onClick={onDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded py-1.5 text-sm font-medium">Delete</button>
                <button onClick={onClose} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded py-1.5 text-sm font-medium">Close</button>
            </div>
        </div>
    );
}

// Helpers
function calculateBboxFromPoint(lat, lon, radiusMeters) {
    const R = 6378137;
    const dLat = radiusMeters / R * 180 / Math.PI;
    const dLon = radiusMeters / (R * Math.cos(Math.PI * lat / 180)) * 180 / Math.PI;
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

function createMarkerElement(className) {
    const el = document.createElement('div');
    el.className = className;
    return el;
}

function generateArrowIcon(mapInstance) {
    const width = 24;
    const height = 24;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 6);
    ctx.lineTo(20, 12);
    ctx.lineTo(4, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const imageData = ctx.getImageData(0, 0, width, height);

    // Always add/overwrite to ensure it exists
    if (mapInstance.hasImage('route-arrow-icon')) {
        mapInstance.removeImage('route-arrow-icon');
    }
    mapInstance.addImage('route-arrow-icon', imageData, { sdf: true });
}
