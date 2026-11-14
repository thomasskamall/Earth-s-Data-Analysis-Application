import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Place } from "../App";

type Props = {
  selected: Place | null;
  onSelect: (place: Place) => void;
  param: string;
  label: string;
  source?: string;
};

type BasemapKey = "light" | "topographic";

const DEFAULT_CENTER: L.LatLngExpression = [20, 0];
const DEFAULT_ZOOM = 2;
const MAP_LATITUDE_LIMIT = 85.05112878;
const REFERENCE_LABELS_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

const BASEMAPS: Record<BasemapKey, { label: string; url: string; attribution: string }> = {
  light: {
    label: "Light gray",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Esri, DeLorme, NAVTEQ",
  },
  topographic: {
    label: "Topographic",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri — Esri, DeLorme, NAVTEQ, TomTom",
  },
};

function clampLatitude(latitude: number): number {
  return Math.max(-MAP_LATITUDE_LIMIT, Math.min(MAP_LATITUDE_LIMIT, latitude));
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function formatCoordinate(latitude: number, longitude: number): string {
  const northSouth = latitude >= 0 ? "N" : "S";
  const eastWest = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(2)}° ${northSouth} / ${Math.abs(longitude).toFixed(2)}° ${eastWest}`;
}

function makeGraticule(): L.LayerGroup {
  const group = L.layerGroup();
  const lineStyle: L.PolylineOptions = {
    color: "#64748b",
    dashArray: "2 6",
    interactive: false,
    opacity: 0.24,
    weight: 1,
  };

  for (let latitude = -60; latitude <= 60; latitude += 30) {
    group.addLayer(L.polyline([[latitude, -180], [latitude, 180]], lineStyle));
  }
  for (let longitude = -180; longitude <= 180; longitude += 30) {
    group.addLayer(L.polyline([[-MAP_LATITUDE_LIMIT, longitude], [MAP_LATITUDE_LIMIT, longitude]], lineStyle));
  }

  return group;
}

function makeSelectionLayers(place: Place): L.Layer[] {
  const latitude = clampLatitude(place.lat);
  const longitude = normalizeLongitude(place.lon);
  const ringStyle: L.CircleMarkerOptions = {
    color: "#b42318",
    fill: false,
    interactive: false,
    opacity: 0.8,
    weight: 1,
  };
  const crosshairStyle: L.PolylineOptions = {
    color: "#b42318",
    dashArray: "3 3",
    interactive: false,
    opacity: 0.65,
    weight: 1,
  };
  const arm = 0.7;

  return [
    L.circleMarker([latitude, longitude], { ...ringStyle, radius: 15, opacity: 0.35 }),
    L.circleMarker([latitude, longitude], { ...ringStyle, radius: 9, opacity: 0.65 }),
    L.polyline([[latitude, normalizeLongitude(longitude - arm)], [latitude, normalizeLongitude(longitude + arm)]], crosshairStyle),
    L.polyline([[clampLatitude(latitude - arm), longitude], [clampLatitude(latitude + arm), longitude]], crosshairStyle),
    L.circleMarker([latitude, longitude], {
      color: "#7f1d1d",
      fillColor: "#ef4444",
      fillOpacity: 1,
      interactive: false,
      radius: 5,
      weight: 2,
    }),
  ];
}

export default function ScientificMap({ selected, onSelect, param, label, source }: Props) {
  const mapHost = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const referenceLayerRef = useRef<L.TileLayer | null>(null);
  const gridRef = useRef<L.LayerGroup | null>(null);
  const selectionRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selected);
  const [mapReady, setMapReady] = useState(false);
  const [basemap, setBasemap] = useState<BasemapKey>("light");
  const [gridEnabled, setGridEnabled] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Create Leaflet once. Prop changes are handled by the effects below so StrictMode
  // does not create competing maps or lose the click handler.
  useEffect(() => {
    const host = mapHost.current;
    if (!host || mapRef.current) return;

    const initialPlace = selectedRef.current;
    const initialCenter: L.LatLngExpression = initialPlace
      ? [clampLatitude(initialPlace.lat), normalizeLongitude(initialPlace.lon)]
      : DEFAULT_CENTER;
    const map = L.map(host, {
      attributionControl: true,
      center: initialCenter,
      keyboard: true,
      minZoom: 1,
      maxZoom: 18,
      zoom: initialPlace ? 4 : DEFAULT_ZOOM,
      worldCopyJump: true,
    });
    mapRef.current = map;

    L.control.scale({ imperial: false, maxWidth: 120, position: "bottomleft", updateWhenIdle: true }).addTo(map);

    const selectionLayer = L.layerGroup().addTo(map);
    const gridLayer = makeGraticule();
    selectionRef.current = selectionLayer;
    gridRef.current = gridLayer;

    const isMapOverlay = (target: EventTarget | null): boolean =>
      target instanceof Element && Boolean(target.closest("[data-map-overlay]"));

    const handleClick = (event: L.LeafletMouseEvent) => {
      if (isMapOverlay(event.originalEvent.target)) return;
      onSelectRef.current({
        lat: clampLatitude(event.latlng.lat),
        lon: normalizeLongitude(event.latlng.lng),
        name: null,
      });
    };
    const handleMouseMove = (event: L.LeafletMouseEvent) => {
      setCursor(formatCoordinate(clampLatitude(event.latlng.lat), normalizeLongitude(event.latlng.lng)));
    };
    const handleMouseOut = () => setCursor(null);

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseOut);

    const invalidate = () => map.invalidateSize({ animate: false, pan: false });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidate);
    resizeObserver?.observe(host);
    invalidate();

    if (toolbar.current) {
      L.DomEvent.disableClickPropagation(toolbar.current);
      L.DomEvent.disableScrollPropagation(toolbar.current);
    }

    setMapReady(true);

    return () => {
      resizeObserver?.disconnect();
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", handleMouseOut);
      selectionRef.current = null;
      gridRef.current = null;
      tileLayerRef.current = null;
      referenceLayerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Swap tiles without recreating the map. Attribution remains in Leaflet's visible
  // attribution control, and an error is informational rather than a click blocker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const config = BASEMAPS[basemap];
    const tile = L.tileLayer(config.url, {
      attribution: config.attribution,
      crossOrigin: true,
      maxNativeZoom: 16,
      maxZoom: 18,
      noWrap: false,
    });
    const handleTileError = () => setTileError(true);
    tile.on("tileerror", handleTileError);
    tile.addTo(map);
    tileLayerRef.current = tile;

    // The light-gray canvas has no place labels of its own. Keep Esri's
    // reference overlay above it; the topographic service already includes labels.
    const reference = basemap === "light"
      ? L.tileLayer(REFERENCE_LABELS_URL, {
        attribution: "Labels © Esri",
        crossOrigin: true,
        maxNativeZoom: 16,
        maxZoom: 18,
        noWrap: false,
      })
      : null;
    if (reference) {
      reference.on("tileerror", handleTileError);
      reference.addTo(map);
      referenceLayerRef.current = reference;
    }
    setTileError(false);

    return () => {
      tile.off("tileerror", handleTileError);
      if (map.hasLayer(tile)) map.removeLayer(tile);
      if (tileLayerRef.current === tile) tileLayerRef.current = null;
      if (reference) {
        reference.off("tileerror", handleTileError);
        if (map.hasLayer(reference)) map.removeLayer(reference);
        if (referenceLayerRef.current === reference) referenceLayerRef.current = null;
      }
    };
  }, [basemap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const grid = gridRef.current;
    if (!map || !grid || !mapReady) return;

    if (gridEnabled) {
      if (!map.hasLayer(grid)) grid.addTo(map);
    } else if (map.hasLayer(grid)) {
      map.removeLayer(grid);
    }
  }, [gridEnabled, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const selectionLayer = selectionRef.current;
    if (!map || !selectionLayer || !mapReady) return;

    selectionLayer.clearLayers();
    if (!selected) return;

    selectionLayer.addLayer(L.layerGroup(makeSelectionLayers(selected)));
    map.setView([clampLatitude(selected.lat), normalizeLongitude(selected.lon)], Math.max(map.getZoom(), 4), {
      animate: true,
    });
  }, [selected, mapReady]);

  const recenterHome = () => {
    mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
  };

  const recenterSelection = () => {
    if (!selected) return;
    mapRef.current?.setView([clampLatitude(selected.lat), normalizeLongitude(selected.lon)], Math.max(mapRef.current.getZoom(), 4), {
      animate: true,
    });
  };

  const variableText = label || param;

  return (
    <div
      ref={mapHost}
      className="absolute inset-0 overflow-hidden"
      role="application"
      aria-label="Scientific geographic map. Click the map to select a location."
      style={{ isolation: "isolate", zIndex: 0 }}
    >
      <div
        ref={toolbar}
        data-map-overlay
        className="absolute right-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-1.5 border border-slate-300 bg-white/95 px-2 py-1.5 text-[11px] text-slate-700 shadow-sm"
        style={{ zIndex: 1100 }}
      >
        <label className="flex items-center gap-1 whitespace-nowrap" htmlFor="scientific-map-basemap">
          <span className="text-slate-500">Basemap</span>
          <select
            id="scientific-map-basemap"
            className="border border-slate-300 bg-white px-1 py-0.5 text-[11px]"
            value={basemap}
            onChange={(event) => setBasemap(event.target.value as BasemapKey)}
          >
            <option value="light">Light gray</option>
            <option value="topographic">Topographic</option>
          </select>
        </label>
        <button type="button" className="border border-slate-300 bg-white px-1.5 py-0.5 hover:bg-slate-100" onClick={recenterHome} title="Reset to the whole-world view">
          Home
        </button>
        <button type="button" className="border border-slate-300 bg-white px-1.5 py-0.5 hover:bg-slate-100 disabled:cursor-default disabled:text-slate-400" onClick={recenterSelection} disabled={!selected} title="Center on the selected location">
          Selection
        </button>
        <label className="flex items-center gap-1 whitespace-nowrap" title="Show latitude and longitude graticule">
          <input type="checkbox" checked={gridEnabled} onChange={(event) => setGridEnabled(event.target.checked)} />
          Grid
        </label>
        <span className="border-l border-slate-300 pl-1.5 tabular-nums" aria-live="polite">
          {cursor ?? "Move over map for coordinates"}
        </span>
      </div>

      <div className="absolute bottom-2 left-2 max-w-[min(28rem,calc(100%-1rem))] space-y-1 text-[11px]" style={{ zIndex: 1100 }}>
        {tileError && (
          <div data-map-overlay className="flex items-center gap-2 border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900 shadow-sm" role="status" aria-live="polite">
            <span>Basemap tiles unavailable; location selection still works.</span>
            <button type="button" className="font-semibold underline" onClick={() => setTileError(false)} aria-label="Dismiss basemap warning">Dismiss</button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border border-slate-300 bg-white/90 px-2 py-1 text-slate-600 shadow-sm">
          <strong className="font-semibold text-slate-800">{variableText}</strong>
          <span>{param}</span>
          {source && <span className="border-l border-slate-300 pl-2">Data source: {source}</span>}
          <span className="border-l border-slate-300 pl-2 text-slate-500">Context map only · basemap is not a climate heatmap</span>
        </div>
      </div>
    </div>
  );
}
