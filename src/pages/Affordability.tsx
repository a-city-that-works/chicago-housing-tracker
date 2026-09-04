import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "../styles/dashboard.css";
import { WardMap } from "../components/WardMap";
import { WardTable } from "../components/WardTable";
import { Controls } from "../components/Controls";
import { Legend } from "../components/Legend";
import { WardDetail } from "../components/WardDetail";
import { BedroomChart } from "../components/BedroomChart";
import { RentVsOwnScatter } from "../components/RentVsOwnScatter";
import type { FilterState, PanelTab, WardsData } from "../types";
import wardsDataRaw from "../data/wards_data.json";

const wardsData = wardsDataRaw as unknown as WardsData;

const TABS: { id: PanelTab; label: string }[] = [
  { id: "table", label: "Ward table" },
  { id: "bedrooms", label: "Unit size" },
  { id: "rentVsOwn", label: "Rent vs. buy" },
];

export function Affordability() {
  const [filters, setFilters] = useState<FilterState>({
    year: "2026",
    metricGroup: "combined",
    viewMode: "level",
    threshold: "60ARO",
  });
  const [selectedWard, setSelectedWard] = useState<number | null>(null);
  const [hoveredWard, setHoveredWard] = useState<number | null>(null);
  const [tab, setTab] = useState<PanelTab>("table");

  const activeWard = useMemo(() => {
    const wardNum = selectedWard ?? hoveredWard;
    if (wardNum == null) return null;
    return wardsData.wards.find((w) => w.ward === wardNum) ?? null;
  }, [selectedWard, hoveredWard]);

  const selectedWardRecord = useMemo(
    () => (selectedWard == null ? null : wardsData.wards.find((w) => w.ward === selectedWard) ?? null),
    [selectedWard]
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">What you can afford</p>
          <h1>Affordability Map</h1>
          <p className="app-subtitle">
            Share of active Zillow listings affordable at 60% or 100% of Area Median Income. Data
            pulled late July 2025 and late July 2026.
          </p>
        </div>
        <Controls filters={filters} onChange={setFilters} />
      </header>

      <div className="app-main">
        <div className="map-panel">
          <WardMap
            wards={wardsData.wards}
            filters={filters}
            selectedWard={selectedWard}
            hoveredWard={hoveredWard}
            onSelectWard={setSelectedWard}
            onHoverWard={setHoveredWard}
          />
          <div className="map-overlay">
            <Legend filters={filters} />
            {activeWard && <WardDetail ward={activeWard} filters={filters} />}
          </div>
        </div>

        <div className="side-panel">
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? "tab active" : "tab"}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
            {selectedWard != null && (
              <button className="clear-selection" onClick={() => setSelectedWard(null)}>
                Clear Ward {selectedWard}
              </button>
            )}
          </div>

          {tab === "table" && (
            <WardTable
              wards={wardsData.wards}
              filters={filters}
              selectedWard={selectedWard}
              hoveredWard={hoveredWard}
              onSelectWard={setSelectedWard}
              onHoverWard={setHoveredWard}
            />
          )}
          {tab === "bedrooms" && (
            <BedroomChart
              wards={wardsData.wards}
              filters={filters}
              selectedWard={selectedWardRecord}
            />
          )}
          {tab === "rentVsOwn" && (
            <RentVsOwnScatter
              wards={wardsData.wards}
              filters={filters}
              selectedWard={selectedWard}
              hoveredWard={hoveredWard}
              onSelectWard={setSelectedWard}
              onHoverWard={setHoveredWard}
            />
          )}
        </div>
      </div>

      <p className="app-footnote">
        Ward boundaries: City of Chicago, Boundaries – Wards (2023–). Listing data manually collected
        from Zillow by the project team; medians and boundaries are approximate. 60% AMI uses Chicago's
        ARO per-bedroom rent limits; 100% AMI uses a single flat monthly cutoff, so the two are not
        methodologically identical. "—" indicates a zero-denominator or unavailable value.{" "}
        <Link to="/glossary">What do these terms mean? →</Link>
      </p>
    </div>
  );
}
