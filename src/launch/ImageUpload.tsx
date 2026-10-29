import { useEffect, useRef, useState } from 'react';
import { useT, type Key } from '../i18n';
import { ACCEPT, prepareImage, TokenImageError, uploadTokenImage, type ImageError } from './tokenImage';

type State =
  | { s: 'empty' }
  | { s: 'busy'; preview: string }
  | { s: 'done'; preview: string; url: string }
  | { s: 'error'; preview?: string; code: ImageError };

const ERR: Record<ImageError, Key> = {
  type: 'imgErrType', too_large: 'imgErrSize', decode: 'imgErrDecode', upload: 'imgErrUpload', network: 'imgErrNetwork',
};

/**
 * Token image picker: square preview, shrinks to 512 × 512 in the browser, uploads to Vercel Blob.
 * Reports the public URL (or undefined while empty, busy or failed) through onChange.
 */
export function ImageUpload({ onChange, disabled }: { onChange: (url: string | undefined) => void; disabled?: boolean }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [st, setSt] = useState<State>({ s: 'empty' });
  const file = useRef<File | null>(null);
  const run = useRef(0);

  // Release the object URL used for the preview.
  const preview = st.s === 'empty' ? undefined : st.preview;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function start(f: File) {
    const id = ++run.current;
    file.current = f;
    onChange(undefined);
    let blob: Blob;
    try {
      blob = await prepareImage(f);
    } catch (e) {
      if (id === run.current) setSt({ s: 'error', code: e instanceof TokenImageError ? e.code : 'decode' });
      return;
    }
    const prev = URL.createObjectURL(blob);
    if (id !== run.current) return URL.revokeObjectURL(prev);
    setSt({ s: 'busy', preview: prev });
    try {
      const url = await uploadTokenImage(blob);
      if (id !== run.current) return;
      setSt({ s: 'done', preview: prev, url });
      onChange(url);
    } catch (e) {
      if (id === run.current) setSt({ s: 'error', preview: prev, code: e instanceof TokenImageError ? e.code : 'upload' });
    }
  }

  function clear() {
    run.current++;
    file.current = null;
    setSt({ s: 'empty' });
    onChange(undefined);
    if (input.current) input.current.value = '';
  }

  const canRetry = st.s === 'error' && file.current && (st.code === 'upload' || st.code === 'network');

  return (
    <div className="lp-img">
      <button
        type="button"
        className={'lp-img-drop' + (st.s === 'error' ? ' err' : '')}
        onClick={() => input.current?.click()}
        disabled={disabled || st.s === 'busy'}
        aria-label={t(preview ? 'imgChange' : 'imgPick')}
      >
        {preview ? <img src={preview} alt="" /> : <span aria-hidden="true" className="lp-img-plus">+</span>}
        {st.s === 'busy' && <span className="lp-img-spin" aria-hidden="true" />}
      </button>
      <div className="lp-img-text">
        <div className="lp-img-title">{t(preview ? 'imgChange' : 'imgPick')}</div>
        <div className={'lp-img-sub' + (st.s === 'error' ? ' err' : st.s === 'done' ? ' ok' : '')} role="status" aria-live="polite">
          {st.s === 'empty' && t('imgHint')}
          {st.s === 'busy' && t('imgUploading')}
          {st.s === 'done' && t('imgDone')}
          {st.s === 'error' && t(ERR[st.code])}
        </div>
        <div className="lp-img-actions">
          {canRetry && <button type="button" className="lp-img-link" onClick={() => file.current && start(file.current)}>{t('retry')}</button>}
          {st.s !== 'empty' && st.s !== 'busy' && <button type="button" className="lp-img-link muted" onClick={clear}>{t('imgRemove')}</button>}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void start(f); }}
      />
    </div>
  );
}
