import { useEffect, useRef, useState } from "react";
import GlobeGL, { type GlobeMethods } from "react-globe.gl";
import type { Place } from "../App";
import { CITIES, type City } from "../data/cities";

// One whole-Earth picture from NASA GIBS (Blue Marble with shaded relief and ocean depth).
const GIBS_IMAGE =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi" +
  "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
  "&LAYERS=BlueMarble_ShadedRelief_Bathymetry&STYLES=" +
  "&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048";

// Used only if GIBS cannot be reached. It is also NASA's Blue Marble picture.
const BACKUP_IMAGE = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";

const MARK = "#f59e0b";

type Props = {
  selected: Place | null;
  onSelect: (place: Place) => void;
};

export default function Globe({ selected, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [image, setImage] = useState<string | null>(null);

  // Keep the globe filling its pane.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Try the NASA GIBS picture first, and fall back to the backup if it fails.
  useEffect(() => {
    const test = new Image();
    test.crossOrigin = "anonymous";
    test.onload = () => setImage(GIBS_IMAGE);
    test.onerror = () => setImage(BACKUP_IMAGE);
    test.src = GIBS_IMAGE;
  }, []);

  // When a place is chosen, fly to it.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !selected) return;
    globe.pointOfView({ lat: selected.lat, lng: selected.lon, altitude: 1.7 }, 800);
  }, [selected]);

  const marker = selected ? [selected] : [];
  const ready = image && size.width > 0 && size.height > 0;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-shell">
      {!ready && <p className="absolute inset-0 grid place-items-center text-dim">Loading the Earth…</p>}
      {ready && (
        <GlobeGL
          ref={globeRef}
          width={size.width}
          height={size.height}
          globeImageUrl={image}
          backgroundColor="#f3f4f6"
          showAtmosphere={false}
          onGlobeReady={() => globeRef.current?.pointOfView({ lat: 20, lng: 30, altitude: 2.2 }, 0)}
          onGlobeClick={({ lat, lng }) => onSelect({ lat, lon: lng, name: null })}
          // City labels: hover shows the name, click selects the city.
          labelsData={CITIES}
          labelLat="lat"
          labelLng="lon"
          labelText="name"
          labelSize={0.55}
          labelDotRadius={0.3}
          labelAltitude={0.01}
          labelResolution={2}
          labelColor={() => "rgba(255,255,255,0.95)"}
          labelLabel={(d) =>
            `<div style="padding:2px 6px;border:1px solid #c9cdd4;background:#fff;color:#1f2937;font:12px Segoe UI,system-ui,sans-serif">${(d as City).name}</div>`
          }
          onLabelClick={(d) => {
            const city = d as City;
            onSelect({ lat: city.lat, lon: city.lon, name: city.name });
          }}
          // The selected place.
          pointsData={marker}
          pointLat="lat"
          pointLng="lon"
          pointColor={() => MARK}
          pointAltitude={0.012}
          pointRadius={0.4}
        />
      )}
    </div>
  );
}
