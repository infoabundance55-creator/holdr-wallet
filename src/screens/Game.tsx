import { useEffect, useRef } from 'react';
import { mountGame } from '../game/engine';
import { createGameApi } from '../game/client';
import '../game/game.css';
import boss from '../game/img/boss.png';
import frog from '../game/img/frog.png';
import laser from '../game/img/laser.png';
import satoshi from '../game/img/satoshi.png';
import { useNav } from '../nav';
import { useApp } from '../state';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Pixelify+Sans:wght@400;500;600;700&display=swap';

/** Load the two pixel fonts only when the game opens. */
function useGameFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONT_HREF}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_HREF;
    document.head.appendChild(l);
  }, []);
}

export function Game() {
  const { signer } = useApp();
  const nav = useNav();
  const ref = useRef<HTMLDivElement>(null);
  const navRef = useRef(nav);
  navRef.current = nav;
  useGameFonts();

  useEffect(() => {
    const el = ref.current;
    if (!el || !signer) return;
    const api = createGameApi(signer);
    const game = mountGame(el, {
      api,
      images: { boss, frog, laser, satoshi },
      onExit: () => navRef.current.pop(),
    });
    return () => game.destroy();
  }, [signer]);

  return <div ref={ref} aria-label="Moon Jump" />;
}
