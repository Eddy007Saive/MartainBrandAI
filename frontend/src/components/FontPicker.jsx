import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { parseFontSpec, buildFontSpec, loadCustomFonts, loadGoogleFont } from '../lib/carrouselPreview';

// Sélecteur de police + gras/italique, forcés sur la police choisie quel que
// soit le poids câblé dans le template (voir _styleOverride côté rendu), avec
// un échantillon rendu dans la vraie police juste en dessous — sans ça, le nom
// seul ne dit rien de ce à quoi elle ressemble.
// `value`/`onChange` portent une seule string ("Famille" ou "Famille|bi").
export default function FontPicker({ value, onChange, options }) {
  const { t } = useTranslation();
  const { family, bold, italic } = parseFontSpec(value || '');
  const set = (f, b, i) => onChange(buildFontSpec(f, b, i));

  useEffect(() => {
    if (!family) return;
    loadCustomFonts([family]);
    loadGoogleFont(family);
  }, [family]);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <select value={family} onChange={(e) => set(e.target.value, bold, italic)}
          className="flex-1 min-w-0 bg-slate-950/60 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50">
          {options.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <button type="button" onClick={() => set(family, !bold, italic)} disabled={!family} title={t('carrousels.policeGras')} aria-pressed={bold}
          className={`w-9 h-9 shrink-0 rounded-lg border font-bold text-[13px] grid place-items-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${bold ? 'bg-[#8A6CFF]/25 border-[#8A6CFF]/60 text-white' : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-slate-200'}`}>
          B
        </button>
        <button type="button" onClick={() => set(family, bold, !italic)} disabled={!family} title={t('carrousels.policeItalique')} aria-pressed={italic}
          className={`w-9 h-9 shrink-0 rounded-lg border italic text-[13px] grid place-items-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${italic ? 'bg-[#8A6CFF]/25 border-[#8A6CFF]/60 text-white' : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-slate-200'}`}>
          I
        </button>
      </div>
      {family && (
        <p className="mt-1.5 px-0.5 text-lg text-slate-300 truncate leading-tight"
          style={{ fontFamily: `'${family}',sans-serif`, fontWeight: bold ? 700 : 400, fontStyle: italic ? 'italic' : 'normal' }}>
          Aa Bb 123
        </p>
      )}
    </div>
  );
}
