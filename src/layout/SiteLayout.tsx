import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { SECTIONS } from "../sections";
import { BLOG_URL } from "../data/blogPosts";
import { pageMeta } from "../pageMeta";

const PARENT_URL = "https://acitythatworks.org";

export function SiteLayout() {
  const { pathname } = useLocation();
  // The tab title follows the page; the per-page HTML only sets it on first load.
  useEffect(() => {
    document.title = pageMeta(pathname).title;
  }, [pathname]);

  return (
    <div className="site">
      <header className="site-header">
        <div className="site-header-inner">
          <NavLink to="/" className="wordmark">
            A City That Works
            <span className="wordmark-sub">Housing</span>
          </NavLink>
          <nav className="site-nav">
            {SECTIONS.map((s) => (
              <NavLink
                key={s.slug}
                to={`/${s.slug}`}
                className={({ isActive }) => (isActive ? "site-nav-link active" : "site-nav-link")}
              >
                {s.nav}
              </NavLink>
            ))}
            <NavLink
              to="/other-maps"
              className={({ isActive }) => (isActive ? "site-nav-link active" : "site-nav-link")}
            >
              Other Maps
            </NavLink>
            <a href={BLOG_URL} target="_blank" rel="noreferrer" className="site-nav-link">
              Newsletter
            </a>
          </nav>
        </div>
        <div className="header-rule" />
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <a href={PARENT_URL} className="footer-wordmark">
              A City That Works
            </a>
            <p className="footer-note">
              A 501(c)(4) civic organization based in Chicago, Illinois.
            </p>
          </div>
          <div className="footer-links">
            <NavLink to="/glossary">Glossary</NavLink>
            <NavLink to="/other-maps">Other useful maps</NavLink>
            <a href={BLOG_URL} target="_blank" rel="noreferrer">
              Newsletter
            </a>
            <a href={`${PARENT_URL}/donate`}>PAC</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
