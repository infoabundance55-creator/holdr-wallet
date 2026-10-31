/** Only our own pages may call write APIs: production, the holdrs.xyz domain, this project's previews, and local dev. */
export function allowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol === 'http:') return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:') return false;
  const h = u.hostname;
  return (
    h === 'holdrs.xyz' || h === 'www.holdrs.xyz' || h === 'holdr-wallet.vercel.app' ||
    /^holdr-wallet-[a-z0-9-]+-infoabundance55-creator\.vercel\.app$/.test(h)
  );
}
