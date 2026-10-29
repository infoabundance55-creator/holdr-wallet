// Holdr X auto-poster. No dependencies (Node 20+).
//
// Usage:
//   node x/post.mjs validate        check every post (length, no links, unique dates)
//   node x/post.mjs check           verify X credentials (GET /2/users/me, ~$0.01)
//   node x/post.mjs post [date]     post the entry for today (Asia/Kuala_Lumpur) or the given YYYY-MM-DD
//
// Env (GitHub Secrets): X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// OAuth 1.0a user context. The app must have "Read and write" permission
// BEFORE the access token is generated.

import { readFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';

const API = 'https://api.x.com/2';
const TZ = 'Asia/Kuala_Lumpur';
const posts = JSON.parse(readFileSync(new URL('./posts.json', import.meta.url), 'utf8'));

// X weighted length: these ranges count 1, everything else (CJK, emoji) counts 2.
function weightedLength(text) {
  const light = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
  let n = 0;
  for (const ch of text.normalize('NFC')) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f) continue; // variation selector
    n += light.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return n;
}

function validate() {
  const errors = [];
  const seen = new Set();
  for (const p of posts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) errors.push(`${p.date}: bad date`);
    if (seen.has(p.date)) errors.push(`${p.date}: duplicate date`);
    seen.add(p.date);
    const len = weightedLength(p.text);
    if (len > 280) errors.push(`${p.date}: ${len}/280 characters`);
    // Links cost $0.20 per post instead of $0.015, and the plan says no links in the body.
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(xyz|com|io|app|org|net)\b/i.test(p.text)) {
      errors.push(`${p.date}: contains a link`);
    }
    console.log(`${p.date}  ${String(len).padStart(3)}/280  ${p.note ?? ''}`);
  }
  if (errors.length) {
    console.error('\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`\nOK: ${posts.length} posts`);
}

const enc = (s) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function authHeader(method, url) {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) {
    throw new Error('Missing X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET');
  }
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: X_API_KEY,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  // JSON bodies are not part of the signature; query params are.
  const params = { ...oauth };
  for (const [k, v] of u.searchParams) params[k] = v;
  const paramStr = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join('&');
  const base = [method, enc(u.origin + u.pathname), enc(paramStr)].join('&');
  const key = `${enc(X_API_SECRET)}&${enc(X_ACCESS_SECRET)}`;
  oauth.oauth_signature = createHmac('sha1', key).update(base).digest('base64');
  return (
    'OAuth ' +
    Object.keys(oauth)
      .sort()
      .map((k) => `${enc(k)}="${enc(oauth[k])}"`)
      .join(', ')
  );
}

async function call(method, path, body) {
  const url = API + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(method, url),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → HTTP ${res.status}\n${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'validate') return validate();

  if (cmd === 'check') {
    const me = await call('GET', '/users/me');
    console.log(`Credentials OK → @${me.data.username} (${me.data.name})`);
    return;
  }

  if (cmd === 'post') {
    const date = arg || today();
    const p = posts.find((x) => x.date === date);
    if (!p) {
      console.log(`No post scheduled for ${date}. Nothing to do.`);
      return;
    }
    const len = weightedLength(p.text);
    if (len > 280) throw new Error(`${date}: ${len}/280 characters, not posting`);
    const out = await call('POST', '/tweets', { text: p.text });
    console.log(`Posted ${date} (${p.note ?? ''}) → https://x.com/i/status/${out.data.id}`);
    return;
  }

  console.error('Usage: node x/post.mjs validate | check | post [YYYY-MM-DD]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
