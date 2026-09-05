import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import type { FilterState, WardRecord } from "../types";
import {
  getGroupCounts,
  getGroupPct,
  getListingsCount,
  getMedian,
  getPctChange,
  getRanks,
  getRankChanges,
  THRESHOLD_LABELS,
} from "../lib/metrics";

interface Row {
  ward: number;
  neighborhood: string;
  listings: number | null;
  median: number | null;
  affordableCount: number | null;
  totalCount: number | null;
  pct: number | null;
  pctChange: number | null;
  rank: number | null;
  rankChange: number | null;
}

interface Props {
  wards: WardRecord[];
  filters: FilterState;
  selectedWard: number | null;
  hoveredWard: number | null;
  onSelectWard: (ward: number | null) => void;
  onHoverWard: (ward: number | null) => void;
}

const columnHelper = createColumnHelper<Row>();

function fmtPct(v: number | null) {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function fmtSignedPct(v: number | null) {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}pp`;
}

function fmtMoney(v: number | null) {
  if (v == null) return "—";
  return `$${v.toLocaleString()}`;
}

function fmtRank(v: number | null) {
  if (v == null) return "—";
  return `#${v}`;
}

function fmtRankChange(v: number | null) {
  if (v == null) return "—";
  if (v === 0) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v}`;
}

export function WardTable({ wards, filters, selectedWard, hoveredWard, onSelectWard, onHoverWard }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "pct", desc: filters.viewMode !== "change" }]);
  const [search, setSearch] = useState("");

  // ranked across all wards, so both columns follow the controls above
  const ranks = useMemo(() => getRanks(wards, filters), [wards, filters]);
  const rankChanges = useMemo(() => getRankChanges(wards, filters), [wards, filters]);

  const rows = useMemo<Row[]>(() => {
    return wards.map((w) => {
      const counts = getGroupCounts(w, filters.year, filters.metricGroup);
      return {
        ward: w.ward,
        neighborhood: w.neighborhoodNames,
        listings: getListingsCount(w, filters.year, filters.metricGroup),
        median: getMedian(w, filters.year, filters.metricGroup),
        affordableCount: counts.affordable,
        totalCount: counts.total,
        pct:
          filters.viewMode === "change"
            ? getPctChange(w, filters.metricGroup, filters.threshold)
            : getGroupPct(w, filters.year, filters.metricGroup, filters.threshold),
        pctChange: getPctChange(w, filters.metricGroup, filters.threshold),
        rank: ranks.get(w.ward) ?? null,
        rankChange: rankChanges.get(w.ward) ?? null,
      };
    });
  }, [wards, filters, ranks, rankChanges]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("ward", {
        header: "Ward",
        cell: (info) => info.getValue(),
        size: 56,
      }),
      columnHelper.accessor("neighborhood", {
        header: "Neighborhood(s)",
        cell: (info) => <span title={info.getValue()}>{info.getValue()}</span>,
      }),
      columnHelper.accessor("listings", {
        header: "Listings",
        cell: (info) => info.getValue() ?? "—",
      }),
      columnHelper.accessor("median", {
        header: filters.metricGroup === "forSale" ? "Median price" : "Median rent",
        cell: (info) => fmtMoney(info.getValue()),
      }),
      columnHelper.accessor("pct", {
        header:
          filters.viewMode === "change"
            ? `Δ % affordable (${THRESHOLD_LABELS[filters.threshold]})`
            : `% affordable (${THRESHOLD_LABELS[filters.threshold]})`,
        cell: (info) => (filters.viewMode === "change" ? fmtSignedPct(info.getValue()) : fmtPct(info.getValue())),
      }),
      columnHelper.accessor("rank", {
        header:
          filters.viewMode === "change" ? "Rank (change)" : `Rank (${filters.year})`,
        cell: (info) => fmtRank(info.getValue()),
      }),
      columnHelper.accessor("rankChange", {
        header: "Rank Δ (YoY)",
        cell: (info) => fmtRankChange(info.getValue()),
      }),
    ],
    [filters]
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      const r = row.original;
      return r.neighborhood.toLowerCase().includes(q) || String(r.ward).includes(q);
    },
  });

  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <input
          className="table-search"
          type="text"
          placeholder="Search ward or neighborhood…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="table-count">{table.getRowModel().rows.length} wards</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[header.column.getIsSorted() as string] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const ward = row.original.ward;
              const isSelected = ward === selectedWard;
              const isHovered = ward === hoveredWard;
              return (
                <tr
                  key={row.id}
                  className={`${isSelected ? "row-selected" : ""} ${isHovered ? "row-hovered" : ""}`.trim()}
                  onMouseEnter={() => onHoverWard(ward)}
                  onMouseLeave={() => onHoverWard(null)}
                  onClick={() => onSelectWard(isSelected ? null : ward)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
