import { describe, expect, it } from 'vitest';
import { pathToRoute, routeToPath, tokenUrl } from './routes';

const A = '0x1234567890abcdef1234567890ABCDEF12345678';

describe('routes', () => {
  it('maps paths both ways', () => {
    for (const p of ['/', '/create', '/points', '/me', '/me/legacy', '/characters', '/play', `/token/${A}`]) expect(routeToPath(pathToRoute(p))).toBe(p);
  });
  it('accepts a trailing slash', () => expect(pathToRoute(`/token/${A}/`)).toEqual({ name: 'token', token: A }));
  it('sends bad addresses and unknown paths home', () => {
    expect(pathToRoute('/token/0x123')).toEqual({ name: 'home', tab: 'discover' });
    expect(pathToRoute('/nope')).toEqual({ name: 'home', tab: 'discover' });
  });
  it('builds the share link', () => expect(tokenUrl(A, 'https://holdrs.xyz')).toBe(`https://holdrs.xyz/token/${A}`));
});
