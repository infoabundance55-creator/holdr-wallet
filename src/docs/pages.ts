/** Every docs page, in reading order. Content lives in ./content/<slug>.md (first line: # Title). */
const files = import.meta.glob('./content/*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export interface DocPage {
  slug: string;
  group: string;
  md: string;
  title: string;
  soon?: boolean;
}

const ORDER: [group: string, slugs: string[], soon?: boolean][] = [
  ['Start here', ['introduction', 'quickstart', 'testnet']],
  ['Wallet', ['wallet-setup', 'wallet-security']],
  ['Launchpad', ['launch-a-token', 'bonding-curve', 'fees', 'anti-snipe', 'graduation', 'creator-earnings', 'launchpad-risks']],
  ['Points · Season 1', ['points', 'house-tiers'], true],
  ['Genesis & Moon Jump', ['genesis-characters', 'moon-jump'], true],
  ['Security & transparency', ['contracts', 'security-reviews', 'admin-controls']],
  ['Developers', ['contract-reference', 'glossary', 'faq']],
];

function titleOf(md: string, slug: string): string {
  const m = /^#\s+(.+)$/m.exec(md);
  if (!m) throw new Error(`docs page ${slug} has no # title`);
  return m[1].trim();
}

export const PAGES: DocPage[] = ORDER.flatMap(([group, slugs, soon]) =>
  slugs.map((slug) => {
    const md = files[`./content/${slug}.md`];
    if (md === undefined) throw new Error(`missing docs page ./content/${slug}.md`);
    return { slug, group, md, title: titleOf(md, slug), soon };
  }),
);

export const GROUPS: string[] = ORDER.map(([g]) => g);

export function pageBySlug(slug: string): DocPage | undefined {
  return PAGES.find((p) => p.slug === slug);
}

/** Plain text of a page, for search. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
