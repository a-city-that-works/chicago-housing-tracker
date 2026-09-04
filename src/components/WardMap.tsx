import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { basemapUrl, BASEMAP_ATTRIBUTION } from "../lib/basemap";
import type { FilterState, WardRecord } from "../types";
import { getMetricValue, getPctChange } from "../lib/metrics";
import { divergingColor, FIXED_BREAKS, sequentialColor, NO_DATA_COLOR } from "../lib/color";

type WardFeature = Feature<Geometry, { ward: number }>;
type WardCollection = FeatureCollection<Geometry, { ward: number }>;

/**
 * Ward geometry is fetched at runtime from public/ rather than imported, so it
 * stays out of the JS bundle and the app shell can paint before it arrives.
 * BASE_URL keeps the path correct under a subpath deploy (e.g. GitHub Pages).
 */
const GEO_URL = `${import.meta.env.BASE_URL}chicago_wards.json`;

interface Props {
  wards: WardRecord[];
  filters: FilterState;
  selectedWard: number | null;
  hoveredWard: number | null;
  onSelectWard: (ward: number | null) => void;
  onHoverWard: (ward: number | null) => void;
}

const CHICAGO_CENTER: [number, number] = [41.8501, -87.6877];

export function WardMap({ wards, filters, selectedWard, hoveredWard, onSelectWard, onHoverWard }: Props) {
  const prefersDark = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
    []
  );
  const [geoData, setGeoData] = useState<WardCollection | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(GEO_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((d: WardCollection) => {
        if (!cancelled) setGeoData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setGeoError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wardMap = useMemo(() => {
    const m = new Map<number, WardRecord>();
    for (const w of wards) m.set(w.ward, w);
    return m;
  }, [wards]);

  // Only the diverging (change) view needs a data-derived domain; the level view
  // uses FIXED_BREAKS so every toggle stays on one comparable scale.
  const maxAbsChange = useMemo(() => {
    let maxAbs = 0;
    for (const w of wards) {
      const v = getPctChange(w, filters.metricGroup, filters.threshold);
      if (v != null) maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    return maxAbs;
  }, [wards, filters.metricGroup, filters.threshold]);

  const styleFeature = (feature?: WardFeature): PathOptions => {
    if (!feature) return {};
    const ward = wardMap.get(feature.properties.ward);
    const isSelected = feature.properties.ward === selectedWard;
    const isHovered = feature.properties.ward === hoveredWard;
    if (!ward) {
      return { fillColor: NO_DATA_COLOR, fillOpacity: 1, color: "#fff", weight: isSelected ? 3 : 1 };
    }
    const value = getMetricValue(ward, filters);
    let fillColor: string;
    let fillOpacity = 1;
    if (filters.viewMode === "change") {
      const c = divergingColor(value, maxAbsChange);
      fillColor = c.fill;
      fillOpacity = c.opacity;
    } else {
      fillColor = sequentialColor(value, FIXED_BREAKS);
    }
    return {
      fillColor,
      fillOpacity,
      color: isSelected ? "#0b0b0b" : "#fff",
      weight: isSelected ? 3 : isHovered ? 2 : 1,
    };
  };

  const onEachFeature = (feature: WardFeature, layer: Layer) => {
    layer.on({
      mouseover: () => onHoverWard(feature.properties.ward),
      mouseout: () => onHoverWard(null),
      click: () =>
        onSelectWard(selectedWard === feature.properties.ward ? null : feature.properties.ward),
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
        style={{ height: "100%", width: "100%", background: "var(--surface-2)" }}
        scrollWheelZoom={true}
      >
        <TileLayer url={basemapUrl(prefersDark)} attribution={BASEMAP_ATTRIBUTION} />
        {geoData && (
          <GeoJSON
            key={`${filters.year}-${filters.metricGroup}-${filters.viewMode}-${filters.threshold}-${selectedWard}-${hoveredWard}`}
            data={geoData}
            style={styleFeature as (feature?: Feature) => PathOptions}
            onEachFeature={onEachFeature as (feature: Feature, layer: Layer) => void}
          />
        )}
      </MapContainer>
    </>
  );
}
