import { Link } from "react-router-dom";
import type { Section } from "../sections";

/**
 * Placeholder for a section that isn't published yet. Deliberately states what it
 * will show, where the data comes from, and what's in the way — a page that says
 * only "coming soon" tells a reader nothing and tells a collaborator less.
 */
export function SectionStub({ section }: { section: Section }) {
  const p = section.planned;
  return (
    <div className="page-narrow">
      <p className="eyebrow">{section.stage}</p>
      <h1 className="page-title">{section.title}</h1>
      <p className="page-lede">{section.blurb}</p>

      <div className={`status-banner status-${section.status}`}>
        <span className="eyebrow">
          {section.status === "in-progress" ? "In progress" : "Planned"}
        </span>
        <p>This section isn&rsquo;t published yet. Here&rsquo;s what it will contain.</p>
      </div>

      {p && (
        <>
          <h2 className="stub-heading">What it will show</h2>
          <ul className="stub-list">
            {p.shows.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2 className="stub-heading">Data source</h2>
          <p className="stub-body">{p.source}</p>

          {p.blocker && (
            <>
              <h2 className="stub-heading">What's in the way</h2>
              <p className="stub-body">{p.blocker}</p>
            </>
          )}
        </>
      )}

      <p className="stub-back">
        <Link to="/affordability">See the affordability data →</Link>
      </p>
    </div>
  );
}
