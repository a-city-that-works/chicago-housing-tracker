/**
 * Each page's title and description, for the browser tab and for link
 * previews. Shared by the site (SiteLayout sets the tab title) and the build
 * (vite.config.ts writes a copy of index.html per page with these in its
 * <head>, since a shared link's preview is read before any script runs).
 */
import { SECTIONS } from "./sections.ts";

export const SITE_URL = "https://housing.acitythatworks.org";
export const SITE_NAME = "Chicago Housing Tracker";
export const SITE_DESCRIPTION = "Ward-by-ward data on housing affordability, supply, and policy in Chicago.";

export interface PageMeta {
  /** Path without a leading slash; "" is the home page. */
  path: string;
  title: string;
  description: string;
}

export const PAGES: PageMeta[] = [
  { path: "", title: `${SITE_NAME} — A City That Works`, description: SITE_DESCRIPTION },
  ...SECTIONS.map((s) => ({ path: s.slug, title: `${s.nav} — ${SITE_NAME}`, description: s.blurb })),
  {
    path: "glossary",
    title: `Glossary — ${SITE_NAME}`,
    description: "AMI, ARO, tax credits, CHA and the other terms behind Chicago's housing numbers.",
  },
  {
    path: "other-maps",
    title: `Other useful maps — ${SITE_NAME}`,
    description: "Chicago housing maps, tools and games by other people and groups: zoning, ADUs, parking reform and housing costs.",
  },
];

export const pageMeta = (path: string): PageMeta =>
  PAGES.find((p) => p.path === path.replace(/^\/|\/$/g, "")) ?? PAGES[0];
