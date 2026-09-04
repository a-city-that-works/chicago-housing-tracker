export interface BedroomBreakdown {
  size: string;
  count: number | null;
  affordable: number | null;
}

export interface ListingGroup {
  listings: number | null;
  medianRent?: number | null;
  medianPrice?: number | null;
  medianMonthlyPayment?: number | null;
  affordable100AMI: number | null;
  affordable60AMI: number | null;
  byBedroom: BedroomBreakdown[];
  totalAffordable60ARO: number | null;
  totalListings0to5br: number | null;
  pctAffordable60ARO: number | null;
  pctAffordable100AMI: number | null;
  pctAffordable60AMIFlat: number | null;
  avgBedroomCount: number | null;
  avgBedroomCountAffordable: number | null;
}

export interface CombinedGroup {
  totalAffordable60ARO: number | null;
  totalListings0to5br: number | null;
  pctAffordable60ARO: number | null;
  pctAffordable100AMI: number | null;
  pctAffordable60AMIFlat: number | null;
}

export interface Ranks {
  rentAffordable100AMI: number | null;
  rentAffordable60ARO: number | null;
  medianRent: number | null;
  ahilAvgRent: number | null;
  saleAffordable100AMI: number | null;
  saleAffordable60ARO: number | null;
  medianSalePrice: number | null;
  ahilAvgHomePrice: number | null;
  combinedAffordable60ARO: number | null;
  average: number | null;
}

export interface YearDetail {
  neighborhoodNames: string;
  zillowUrl: string;
  rentals: ListingGroup;
  forSale: ListingGroup;
  combined: CombinedGroup;
  ahil: { avgRent: number | null; avgHomePrice: number | null };
  ranks: Ranks;
  zillowRentalRatio: number | null;
}

export interface YoYYear {
  rentalListings: number | null;
  medianRent: number | null;
  forSaleListings: number | null;
  medianSalePrice: number | null;
  medianMonthlyPayment: number | null;
  rentalAffordable60ARO: number | null;
  forSaleAffordable60ARO: number | null;
  combinedAffordable60ARO: number | null;
  pctCombinedAffordable60ARO: number | null;
  rank: number | null;
}

export interface Comparison {
  neighborhoodNames: string;
  y2025: YoYYear;
  y2026: YoYYear;
  pctChange: {
    rentalListings: number | null;
    medianRent: number | null;
    forSaleListings: number | null;
    medianSalePrice: number | null;
    medianMonthlyPayment: number | null;
    rentalAffordable60ARO: number | null;
    forSaleAffordable60ARO: number | null;
    combinedAffordable60ARO: number | null;
  };
  rankChange: number | null;
}

export interface WardRecord {
  ward: number;
  neighborhoodNames: string;
  y2025: YearDetail | null;
  y2026: YearDetail | null;
  comparison: Comparison | null;
}

export interface WardsData {
  wards: WardRecord[];
  citywide: {
    y2025: YearDetail | null;
    y2026: YearDetail | null;
    comparison: Comparison | null;
  };
}

export type YearKey = "2025" | "2026";
export type MetricGroup = "combined" | "rentals" | "forSale";
export type ViewMode = "level" | "change";
/**
 * "60ARO" = Chicago ARO per-bedroom rent limits at 60% AMI (bedroom-adjusted).
 * "100AMI" = a single flat citywide monthly cutoff at 100% AMI (not bedroom-adjusted).
 * These differ in BOTH threshold and method — see the note in the UI.
 */
export type AmiThreshold = "60ARO" | "100AMI";
export type PanelTab = "table" | "bedrooms" | "rentVsOwn";

export interface FilterState {
  year: YearKey;
  metricGroup: MetricGroup;
  viewMode: ViewMode;
  threshold: AmiThreshold;
}

export interface BedroomStat {
  size: string;
  label: string;
  total: number;
  affordable: number;
  pct: number | null;
}
