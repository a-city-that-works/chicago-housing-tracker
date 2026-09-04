/**
 * Single source of truth for site sections: drives the header nav, the landing
 * page cards, and the routes. Adding or renaming a section is a one-line change
 * here — deliberate, since the IA will shift as data sources get confirmed.
 */
export type SectionStatus = "live" | "in-progress" | "planned";

export interface Section {
  /** Route path, without leading slash. */
  slug: string;
  /** Nav label. */
  nav: string;
  /** Full title used on the section page and landing card. */
  title: string;
  /** One line for the landing card. */
  blurb: string;
  /** What stage of the housing story this covers. */
  stage: string;
  status: SectionStatus;
  /** Shown on stub pages: what it will contain and what is blocking it. */
  planned?: {
    shows: string[];
    source: string;
    blocker?: string;
  };
}

export const SECTIONS: Section[] = [
  {
    slug: "affordability",
    nav: "Affordability Map",
    title: "Affordability Map",
    blurb:
      "Ward-by-ward view of active for-rent and for-sale listings within reach based on area median income standards.",
    stage: "What you can afford",
    status: "live",
  },
  {
    slug: "permitting",
    nav: "Permitting Map",
    title: "Permitting Map",
    blurb: "New housing permits approved by ward.",
    stage: "What gets built",
    status: "live",
    planned: {
      shows: [
        "New residential units permitted per ward, per year",
        "Which wards approve housing and which do not",
        "Permit activity set against each ward's affordability",
      ],
      source: "Chicago Building Permits (ydr8-5enu)",
      blocker:
        "The permit dataset carries a ward on every record but no unit count in any of its 122 columns, and the free-text descriptions mix real housing in with garages, permit revisions, and temporary event structures. Getting a trustworthy unit count means extracting it from that text and publishing an honest error rate.",
    },
  },
  {
    slug: "income",
    nav: "Income & Building",
    title: "Income and housing production",
    blurb:
      "Does a ward's wealth predict how much housing it approves? Median household income plotted against permits.",
    stage: "Who builds",
    status: "live",
  },
];

export const getSection = (slug: string) => SECTIONS.find((s) => s.slug === slug);
