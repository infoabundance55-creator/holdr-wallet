import { describe, expect, it } from 'vitest';
import { PAGES, pageBySlug } from './pages';
import { renderPage } from './render';
import { scrubDocsUrl } from './analytics';

describe('docs pages', () => {
  it('every page has a title and unique slug', () => {
    expect(PAGES.length).toBeGreaterThan(10);
    expect(new Set(PAGES.map((p) => p.slug)).size).toBe(PAGES.length);
    for (const p of PAGES) expect(p.title.length).toBeGreaterThan(2);
  });

  it('every internal link points to an existing page and heading', () => {
    const anchors = new Map(PAGES.map((p) => [p.slug, new Set(renderPage(p.md).headings.map((h) => h.id))]));
    for (const p of PAGES) {
      for (const m of p.md.matchAll(/\]\((\/docs\/[^)\s]*)\)/g)) {
        const [, slug, hash] = /^\/docs\/([a-z0-9-]+)(?:#([a-z0-9-]+))?$/.exec(m[1]) ?? [];
        expect(slug, `${p.slug}: bad link ${m[1]}`).toBeTruthy();
        expect(pageBySlug(slug), `${p.slug}: unknown page ${m[1]}`).toBeTruthy();
        if (hash) expect(anchors.get(slug)?.has(hash), `${p.slug}: unknown heading ${m[1]}`).toBe(true);
      }
    }
  });

  it('external links open safely in a new tab', () => {
    const { html } = renderPage('[x](https://example.com)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('raw HTML in Markdown is escaped, not rendered', () => {
    const { html } = renderPage('<img src=x onerror=alert(1)>\n\nhello <b>x</b>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
  });

  it('headings get ids for the table of contents', () => {
    const { headings, html } = renderPage('# T\n\n## How it works\n\n### Step one');
    expect(headings).toEqual([
      { id: 'how-it-works', text: 'How it works', depth: 2 },
      { id: 'step-one', text: 'Step one', depth: 3 },
    ]);
    expect(html).toContain('id="how-it-works"');
  });
});

describe('docs analytics', () => {
  it('keeps only /docs page paths', () => {
    expect(scrubDocsUrl('https://h.app/docs/fees?x=1#y')).toBe('https://h.app/docs/fees');
    expect(scrubDocsUrl('https://h.app/docs')).toBe('https://h.app/docs');
    expect(scrubDocsUrl('https://h.app/app/send')).toBeNull();
    expect(scrubDocsUrl('https://h.app/docs/0x' + 'a'.repeat(40))).toBeNull();
    expect(scrubDocsUrl('not a url')).toBeNull();
  });
});
