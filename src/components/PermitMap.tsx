import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { basemapUrl, BASEMAP_ATTRIBUTION } from "../lib/basemap";
import { permitColor, PERMIT_NO_DATA, type WardPermits } from "../lib/permits";

type WardFeature = Feature<Geometry, { ward: number }>;
type WardCollection = FeatureCollection<Geometry, { ward: number }>;

const GEO_URL = `${import.meta.env.BASE_URL}chicago_wards.json`;
const CHICAGO_CENTER: [number, number] = [41.8501, -87.6877];

interface Props {
  rows: WardPermits[];
  selectedWard: number | null;
  hoveredWard: number | null;
  onSelectWard: (w: number | null) => void;
  onHoverWard: (w: number | null) => void;
}

export function PermitMap({
  rows,
  selectedWard,
  hoveredWard,
  onSelectWard,
  onHoverWard,
}: Props) {
  const [geoData, setGeoData] = useState<WardCollection | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const prefersDark = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
    []
  );

  useEffect(() => {
    let cancelled = false;
    fetch(GEO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((d: WardCollection) => !cancelled && setGeoData(d))
      .catch((e: unknown) =>
        !cancelled && setGeoError(e instanceof Error ? e.message : "Failed to load")
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const byWard = useMemo(() => new Map(rows.map((r) => [r.ward, r])), [rows]);

  const styleFeature = (feature?: WardFeature): PathOptions => {
    if (!feature) return {};
    const w = feature.properties.ward;
    const row = byWard.get(w);
    const isSelected = w === selectedWard;
    const isHovered = w === hoveredWard;
    return {
      fillColor: row ? permitColor(row.perYear) : PERMIT_NO_DATA,
      fillOpacity: 1,
      color: isSelected ? "#0a1014" : "#fff",
      weight: isSelected ? 3 : isHovered ? 2 : 1,
    };
  };

  const onEachFeature = (feature: WardFeature, layer: Layer) => {
    const w = feature.properties.ward;
    layer.on({
      mouseover: () => onHoverWard(w),
      mouseout: () => onHoverWard(null),
      click: () => onSelectWard(selectedWard === w ? null : w),
    });
  };

  return (
    <>
      {!geoData && (
        <div className="map-status" role="status">
          {geoError ? `Could not load ward boundaries: ${geoError}` : "Loading ward boundaries…"}
        </div>
      )}
      <MapContainer
        center={CHICAGO_CENTER}
        zoom={11}
        style={{ height: "100%", width: "100%", background: "var(--surface)" }}
        scrollWheelZoom={true}
      >
        <TileLayer url={basemapUrl(prefersDark)} attribution={BASEMAP_ATTRIBUTION} />
        {geoData && (
          <GeoJSON
            key={`${rows.map((r) => r.perYear.toFixed(1)).join(",")}-${selectedWard}-${hoveredWard}`}
            data={geoData}
            style={styleFeature as (f?: Feature) => PathOptions}
            onEachFeature={onEachFeature as (f: Feature, l: Layer) => void}
          />
        )}
      </MapContainer>
    </>
  );
}
