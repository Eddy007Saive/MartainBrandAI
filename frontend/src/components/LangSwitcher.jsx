import { useTranslation } from 'react-i18next';

const LANGS = [
  { id: 'fr', label: 'FR' },
  { id: 'en', label: 'EN' },
  { id: 'es', label: 'ES' },
];

/** Sélecteur de langue de l'INTERFACE (persisté en localStorage par le detector). */
export default function LangSwitcher({ className = '' }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || 'fr').slice(0, 2);
  return (
    <div className={`inline-flex gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.08] ${className}`} data-testid="lang-switcher">
      {LANGS.map((l) => (
        <button key={l.id} type="button" onClick={() => i18n.changeLanguage(l.id)}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold font-inter transition-colors ${
            current === l.id ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
