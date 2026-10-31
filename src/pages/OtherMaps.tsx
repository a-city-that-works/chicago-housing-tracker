/**
 * Maps and tools by other people that pair well with this site. We don't run
 * them, so each entry says who does. Checked by hand; recheck the links with
 * the quarterly refresh.
 */

interface Tool {
  name: string;
  url: string;
  by: string;
  what: string;
  /** Set for tools that cover more than Chicago. */
  scope?: string;
}

const CHECKED = "October 31, 2026";

const TOOLS: Tool[] = [
  {
    name: "ADU Opt-In Dashboard",
    url: "https://www.strongtownschicago.org/adu-opt-in-dashboard",
    by: "Strong Towns Chicago",
    what: "Which alders have opted their wards' single-family zones into the 2025 ADU ordinance, and with what restrictions.",
  },
  {
    name: "What's Banned on Your Block?",
    url: "https://www.strongtownschicago.org/whats-banned-on-your-block",
    by: "Strong Towns Chicago",
    what: "Enter an address to see which homes and businesses its zoning rules out, from three-flats to corner stores.",
  },
  {
    name: "Chicago Parking Reform Map",
    url: "https://misterclean.github.io/chicago-parking-reform/",
    by: "Michael McLean",
    what: "Where the City's 2025 ordinance ending parking mandates lets new homes be built without parking.",
  },
  {
    name: "Illinois People Over Parking Act",
    url: "https://misterclean.github.io/illinois-people-over-parking-act/",
    by: "Michael McLean",
    what: "The transit-access areas where Illinois' state law on parking mandates applies.",
    scope: "Illinois",
  },
  {
    name: "Chicago Zoning Map",
    url: "https://gisapps.chicago.gov/ZoningMapWeb/",
    by: "City of Chicago",
    what: "The official zoning map; look up the zoning district for any address.",
  },
  {
    name: "Housing Cost Burden Map",
    url: "https://ryanradia.github.io/housingcost/",
    by: "Ryan Radia",
    what: "A zip-code based view of housing costs vs median incomes.",
    scope: "U.S. metro areas",
  },
  {
    name: "Fix Chicago Housing",
    url: "https://www.strongtownschicago.org/fix-chicago-housing",
    by: "Strong Towns Chicago",
    what: "Play housing commissioner: rezone near the L and try real policies to build enough homes by 2041.",
  },
  {
    name: "Chicago Affordable Housing Developer",
    url: "https://danielkayhertz.com/developergame/",
    by: "Daniel Kay Hertz",
    what: "Play an affordable-housing developer: piece together tax credits, TIF and City loans, and win over the alder and the neighbors.",
  },
];

export function OtherMaps() {
  return (
    <div className="page-narrow">
      <p className="eyebrow">Elsewhere</p>
      <h1 className="page-title">Other useful maps</h1>
      <p className="page-lede">Some other online maps and tools we think are worth checking out.</p>

      <ul className="tool-list tool-list-solo">
        {TOOLS.map((t) => (
          <li key={t.url}>
            <a href={t.url} target="_blank" rel="noreferrer" className="tool-name">
              {t.name}
            </a>
            <span className="tool-by">
              {t.by}
              {t.scope && <> &middot; {t.scope}</>}
            </span>
            <p className="tool-what">{t.what}</p>
          </li>
        ))}
      </ul>

      <p className="tool-checked">Links checked {CHECKED}.</p>
    </div>
  );
}
