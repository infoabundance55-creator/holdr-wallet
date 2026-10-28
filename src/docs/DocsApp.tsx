import { useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS, PAGES, pageBySlug, plainText, type DocPage } from './pages';
import { renderPage } from './render';
import { docsPageView } from './analytics';

const REPO = 'https://github.com/infoabundance55-creator/holdr-wallet';
const SEARCH_INDEX = PAGES.map((p) => ({ page: p, text: plainText(p.md) }));

function slugFromPath(path: string): string {
  const m = /^\/docs\/?([a-z0-9-]*)/.exec(path);
  return m?.[1] || PAGES[0].slug;
}

function Logo() {
  return <img src="/icon.svg" width="28" height="28" alt="" />;
}

export default function DocsApp() {
  const [slug, setSlug] = useState(() => slugFromPath(window.location.pathname));
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const page: DocPage = pageBySlug(slug) ?? PAGES[0];
  const notFound = !pageBySlug(slug);
  const { html, headings } = useMemo(() => renderPage(page.md), [page]);
  const index = PAGES.indexOf(page);
  const prev = PAGES[index - 1];
  const next = PAGES[index + 1];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return SEARCH_INDEX.filter(({ page: p, text }) => p.title.toLowerCase().includes(q) || text.includes(q))
      .map(({ page: p, text }) => {
        const at = text.indexOf(q);
        const snippet = at < 0 ? '' : (at > 40 ? '…' : '') + text.slice(Math.max(0, at - 40), at + 80) + '…';
        return { page: p, snippet };
      })
      .slice(0, 12);
  }, [query]);

  function go(next: string, hash = '') {
    window.history.pushState(null, '', `/docs/${next}${hash}`);
    setSlug(next);
    setMenuOpen(false);
    setQuery('');
    if (!hash) window.scrollTo(0, 0);
  }

  // back / forward
  useEffect(() => {
    const onPop = () => setSlug(slugFromPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // title, analytics, jump to #hash
  useEffect(() => {
    document.title = `${page.title} · Holdr Docs`;
    docsPageView(`/docs/${page.slug}`);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, [page]);

  // "/" or Ctrl/Cmd+K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setMenuOpen(true);
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // internal links inside articles navigate without reloading
  function onArticleClick(e: React.MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey) return;
    const href = a.getAttribute('href') ?? '';
    const m = /^\/docs\/([a-z0-9-]+)(#[a-z0-9-]+)?$/.exec(href);
    if (m) {
      e.preventDefault();
      go(m[1], m[2] ?? '');
      if (m[2]) setTimeout(() => document.getElementById(m[2].slice(1))?.scrollIntoView(), 0);
    }
  }

  const nav = (
    <nav className="side" aria-label="Documentation">
      <label className="search">
        <span className="sr-only">Search the docs</span>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          type="search"
          placeholder="Search docs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <kbd>/</kbd>
      </label>
      {results ? (
        <ul className="results">
          {results.length === 0 && <li className="empty">No pages match “{query}”.</li>}
          {results.map(({ page: p, snippet }) => (
            <li key={p.slug}>
              <a href={`/docs/${p.slug}`} onClick={(e) => (e.preventDefault(), go(p.slug))}>
                <strong>{p.title}</strong>
                <span>{p.group}</span>
                {snippet && <em>{snippet}</em>}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        GROUPS.map((g) => (
          <div className="group" key={g}>
            <h2>{g}</h2>
            <ul>
              {PAGES.filter((p) => p.group === g).map((p) => (
                <li key={p.slug}>
                  <a
                    href={`/docs/${p.slug}`}
                    aria-current={p.slug === page.slug ? 'page' : undefined}
                    onClick={(e) => (e.preventDefault(), go(p.slug))}
                  >
                    {p.title}
                    {p.soon && <span className="soon">Soon</span>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </nav>
  );

  return (
    <div className="docs">
      <header className="top">
        <button className="menu" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <a className="brand" href="/docs/introduction" onClick={(e) => (e.preventDefault(), go('introduction'))}>
          <Logo />
          <span>Holdr</span>
          <span className="tag">Docs</span>
        </a>
        <span className="net">Testnet</span>
        <a className="cta" href="/">Open wallet</a>
      </header>

      <div className="layout">
        <aside className={`drawer${menuOpen ? ' open' : ''}`}>{nav}</aside>
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

        <main className="main">
          <div className="crumbs">
            <span>Docs</span>
            <span aria-hidden="true">/</span>
            <span>{page.group}</span>
            {page.soon && <span className="soon">Coming soon</span>}
          </div>
          {notFound && (
            <aside className="callout warning">
              <p>That page does not exist. Here is the introduction instead.</p>
            </aside>
          )}
          <article className="prose" onClick={onArticleClick} dangerouslySetInnerHTML={{ __html: html }} />
          <div className="pager">
            {prev ? (
              <a href={`/docs/${prev.slug}`} onClick={(e) => (e.preventDefault(), go(prev.slug))}>
                <span>← Previous</span>
                <strong>{prev.title}</strong>
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a className="next" href={`/docs/${next.slug}`} onClick={(e) => (e.preventDefault(), go(next.slug))}>
                <span>Next →</span>
                <strong>{next.title}</strong>
              </a>
            )}
          </div>
          <footer className="foot">
            <a href={`${REPO}/blob/main/src/docs/content/${page.slug}.md`} target="_blank" rel="noopener noreferrer">
              Edit this page on GitHub
            </a>
            <span>
              <a href="https://x.com/holdr_app" target="_blank" rel="noopener noreferrer">X @holdr_app</a>
              {' · '}
              <a href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
            </span>
          </footer>
        </main>

        {headings.length > 1 && (
          <nav className="toc" aria-label="On this page">
            <h2>On this page</h2>
            <ul>
              {headings.map((h) => (
                <li key={h.id} className={h.depth === 3 ? 'sub' : undefined}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
