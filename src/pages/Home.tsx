import { useState } from "react";
import { Link } from "react-router-dom";
import { SECTIONS } from "../sections";
import { BLOG_POSTS, BLOG_URL, POSTS_VISIBLE, groupByYear, postUrl } from "../data/blogPosts";

const IHS_URL = "https://www.housingstudies.org/";
const SUGGEST_EMAIL = "citythatworks@substack.com";

export function Home() {
  const [showAllPosts, setShowAllPosts] = useState(false);
  const visiblePosts = showAllPosts ? BLOG_POSTS : BLOG_POSTS.slice(0, POSTS_VISIBLE);
  const postGroups = groupByYear(visiblePosts);
  const hiddenCount = BLOG_POSTS.length - POSTS_VISIBLE;

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">Chicago Housing Tracker</p>
        <h1 className="hero-title">How are we doing at keeping Chicago affordable?</h1>
        <p className="hero-lede">
          Chicago has long been one of the most affordable big cities in America. That status is
          increasingly under threat as we fail to build enough new housing. This dashboard tracks
          where it's still affordable to live, where we're building, and who's backing the effort to
          build more.
        </p>
      </section>

      <section className="pullquote">
        <p className="pullquote-text">
          Chicago is short roughly <strong>120,000 rental homes</strong> affordable to its
          lowest-income renters — a gap that widened by nearly 20,000 units in just two years.
        </p>
        <p className="pullquote-source">
          <a href={IHS_URL} target="_blank" rel="noreferrer">
            Institute for Housing Studies, DePaul University
          </a>{" "}
          · 2021, the most recent year with a published gap figure
        </p>
      </section>

      <section className="home-section">
        <div className="section-cards">
          {SECTIONS.map((sec) => (
            <Link key={sec.slug} to={`/${sec.slug}`} className="section-card">
              <div className="card-top">
                <span className="eyebrow">{sec.stage}</span>
                {sec.status !== "live" && (
                  <span className={`status-pill status-${sec.status}`}>
                    {sec.status === "in-progress" ? "In progress" : "Planned"}
                  </span>
                )}
              </div>
              <h2 className="card-title">{sec.title}</h2>
              <p className="card-blurb">{sec.blurb}</p>
              <span className="card-cta">
                {sec.status === "live" ? "Explore the data →" : "See what's planned →"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="suggest">
          <h2 className="suggest-heading">What else?</h2>
          <p className="suggest-body">
            These are a starting point, not the whole picture. If there&rsquo;s a cut of
            Chicago housing data you want and can&rsquo;t find &mdash; here or anywhere
            &mdash; tell us and we&rsquo;ll look into building it.
          </p>
          <a
            className="suggest-cta"
            href={`mailto:${SUGGEST_EMAIL}?subject=${encodeURIComponent(
              "Chicago Housing Tracker: suggestion"
            )}`}
          >
            {SUGGEST_EMAIL}
          </a>
        </div>
      </section>

      <section className="home-section">
        <h2 className="coverage-heading">Our Coverage</h2>
        <p className="coverage-lede">
          For more information on housing policy in Chicago, check out some of our recent coverage
          at{" "}
          <a href={BLOG_URL} target="_blank" rel="noreferrer">
            A City That Works
          </a>
          .
        </p>

        {postGroups.map((group) => (
          <div className="post-year" key={group.year}>
            <h3 className="post-year-label">{group.year}</h3>
            <ul className="post-list">
              {group.posts.map((post) => (
                <li key={post.slug}>
                  <a
                    href={postUrl(post.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="post-link"
                  >
                    <span className="post-title">{post.title}</span>
                    <span className="post-subtitle">{post.subtitle}</span>
                  </a>
                  <p className="post-byline">
                    {post.author}
                    <span className="post-byline-sep">·</span>
                    <time dateTime={post.date}>
                      {new Date(`${post.date}T12:00:00`).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="post-actions">
          {hiddenCount > 0 && (
            <button
              type="button"
              className="post-toggle"
              onClick={() => setShowAllPosts((v) => !v)}
              aria-expanded={showAllPosts}
            >
              {showAllPosts ? "Show fewer" : `Show all ${BLOG_POSTS.length} posts`}
            </button>
          )}
          <a href={BLOG_URL} target="_blank" rel="noreferrer" className="text-cta">
            Read the newsletter →
          </a>
        </div>
      </section>
    </div>
  );
}
