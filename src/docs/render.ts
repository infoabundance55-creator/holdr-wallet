import { Marked, type Tokens } from 'marked';

export interface Heading {
  id: string;
  text: string;
  depth: 2 | 3;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Renders our own Markdown (from the repo, never user input). Headings get ids for the
 * "On this page" list, external links open in a new tab, blockquotes become callouts, and
 * raw HTML in the source is escaped rather than rendered.
 */
export function renderPage(md: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeAttr(token.text);
      },
      heading(token: Tokens.Heading) {
        const text = this.parser.parseInline(token.tokens);
        if (token.depth === 1) return `<h1>${text}</h1>`;
        const id = slugify(token.text);
        if (token.depth === 2 || token.depth === 3) headings.push({ id, text: token.text.replace(/[*`]/g, ''), depth: token.depth });
        return `<h${token.depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${token.depth}>`;
      },
      link(token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        const href = escapeAttr(token.href);
        if (/^https?:\/\//.test(token.href)) {
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}<span class="ext" aria-hidden="true">↗</span></a>`;
        }
        return `<a href="${href}">${text}</a>`;
      },
      blockquote(token: Tokens.Blockquote) {
        const body = this.parser.parse(token.tokens);
        const kind = /^\s*\*\*(Note|Tip|Warning|Coming soon|Testnet)\b/.exec(token.text)?.[1]?.toLowerCase().replace(' ', '-') ?? 'note';
        return `<aside class="callout ${kind}">${body}</aside>`;
      },
      table(token: Tokens.Table) {
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows
          .map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`)
          .join('');
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      },
    },
  });
  const html = marked.parse(md, { async: false });
  return { html, headings };
}
