import { useEffect, useRef } from 'react';
import { ART } from '../launch/parts';
import { LEVELS, houseImg, levelFor, levelProgress, lookFor } from '../launch/points';
import type { Me } from '../account/client';
import { gameApi } from './client';
import { mountGame, type GameProfile } from './engine';
import './game.css';

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

function profileOf(me: Me): GameProfile {
  const lv = levelFor(me.total);
  const next = LEVELS[lv.lvl] ?? null;
  return {
    username: me.username ?? 'anon',
    char: lookFor(me.total, me.look),
    total: me.total,
    house: { img: houseImg(lv.lvl), name: lv.house, title: lv.title },
    next: next && { name: next.house, min: next.min },
    progress: levelProgress(me.total),
  };
}

/** Moon Jump, full screen. The page around it handles sign-in; the game only plays. */
export function MoonJump({ me, onExit, onChangeLook, onSignedOut }: {
  me: Me; onExit: () => void; onChangeLook: () => void; onSignedOut: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef({ me, onExit, onChangeLook, onSignedOut });
  live.current = { me, onExit, onChangeLook, onSignedOut };
  const game = useRef<ReturnType<typeof mountGame> | null>(null);
  useGameFonts();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = mountGame(el, {
      api: gameApi,
      images: { raccoon: ART.raccoon, frog: ART.frog, bull: ART.bull, anon: ART.anon },
      profile: () => profileOf(live.current.me),
      onExit: () => live.current.onExit(),
      onChangeLook: () => live.current.onChangeLook(),
      onSignedOut: () => live.current.onSignedOut(),
    });
    game.current = g;
    return () => { g.destroy(); game.current = null; };
  }, []);

  // New look or points: redraw the title screen.
  useEffect(() => { game.current?.refresh(); }, [me]);

  return <div ref={ref} aria-label="Moon Jump" />;
}
