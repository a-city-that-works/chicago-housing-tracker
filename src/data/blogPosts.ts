/**
 * Housing coverage from the newsletter, surfaced at the bottom of the landing page.
 *
 * Titles and dates were read from the Substack archive API and each post's own
 * page, not inferred from the URL — several slugs no longer match their titles
 * (e.g. `lets-fix-the-building-code` is now "A plan to cut construction costs").
 *
 * Hand-maintained. To make it self-updating, replace this array with a
 * build-time fetch of https://citythatworks.substack.com/feed — the shape below
 * matches what the feed provides.
 */
export interface BlogPost {
  title: string;
  /** Substack slug; the full URL is derived from it. */
  slug: string;
  /** ISO date (YYYY-MM-DD), used for ordering and display. */
  date: string;
  /** The post's own subtitle, as published. */
  subtitle: string;
  /** Byline. Comma-separated where a post has more than one author. */
  author: string;
}

export const BLOG_URL = "https://citythatworks.substack.com";

export const postUrl = (slug: string) => `${BLOG_URL}/p/${slug}`;

/** Newest first. */
export const BLOG_POSTS: BlogPost[] = [
  { date: "2026-08-11", slug: "lets-fix-the-building-code", title: "A plan to cut construction costs" , subtitle: "Four changes to boost construction across Chicago", author: "Daniel Koslovsky" },
  { date: "2026-08-06", slug: "an-agenda-for-family-friendly-housing", title: "An agenda for family-friendly housing" , subtitle: "In high-income neighborhoods, Chicago rewards studio apartments and mansions", author: "Adam Drakulic" },
  { date: "2026-07-17", slug: "a-milestone-to-celebrate", title: "A milestone worth celebrating" , subtitle: "Our first posting to policy success", author: "Richard Day" },
  { date: "2026-04-28", slug: "small-lots-and-the-case-for-single", title: "Small lots and the case for single stair reform" , subtitle: "A step towards more family friendly housing", author: "Zak Yudhishthu, Alex Montero" },
  { date: "2026-02-12", slug: "against-small-plans", title: "Against small plans" , subtitle: "Chicago has a housing crisis. Let's act like it.", author: "Richard Day" },
  { date: "2025-11-20", slug: "lessons-from-new-yorks-recent-housing", title: "Lessons from New York's recent housing wins" , subtitle: "A path to better housing policy in one of our most expensive cities", author: "Richard Day" },
  { date: "2025-10-14", slug: "housing-lessons-from-minneapolis", title: "Housing lessons from Minneapolis" , subtitle: "Midwestern cities can control housing costs too", author: "Daniel Koslovsky" },
  { date: "2025-07-09", slug: "a-request-to-the-common-sense-caucus", title: "A request to the Common Sense Caucus: support pro-growth housing policy" , subtitle: "(it ought to be common sense, too)", author: "Conor Durkin" },
  { date: "2025-01-30", slug: "the-long-road-out-of-prerogative", title: "The long road out of prerogative" , subtitle: "Aldermanic prerogative is antiquated and hurting our city. But reform is possible.", author: "Lionel Barrow" },
  { date: "2025-01-13", slug: "proactive-upzoning-is-a-recipe-for", title: "Proactive upzoning is a recipe for lower rents and more tax revenue" , subtitle: "An encouraging trend in Chicago land-use policy", author: "Richard Day" },
  { date: "2024-12-19", slug: "lets-make-it-cheaper-to-build", title: "Let's make it cheaper to build" , subtitle: "Construction costs are a major driver of Chicago's affordability challenge", author: "Richard Day" },
  { date: "2024-10-25", slug: "something-great-just-happened-on", title: "Something great just happened on Western Avenue" , subtitle: "A recipe for more tax revenue, lower rents, and cleaner politics", author: "Richard Day" },
];

/** How many show before the reader asks for the rest. */
export const POSTS_VISIBLE = 6;

/** Group posts by publication year, newest year first. */
export function groupByYear(posts: BlogPost[]): { year: string; posts: BlogPost[] }[] {
  const groups = new Map<string, BlogPost[]>();
  for (const p of posts) {
    const y = p.date.slice(0, 4);
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y)!.push(p);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, posts]) => ({ year, posts }));
}
