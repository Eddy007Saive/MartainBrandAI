import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Grid3x3, Loader2, Plus } from 'lucide-react';
import { agentService } from '../services/agentService';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]/70';
const cleCase = (i) => `${i.pilier}|${i.format}`;

/**
 * Matrice « piliers × formats » du Plan éditorial : une idée par pilier de la marque et par format
 * publiable, pour varier le mois d'un coup d'œil. Le client coche les idées qu'il garde ; elles
 * rejoignent ses sujets (puis la rafale, comme les autres). La dernière matrice est gardée dans
 * le navigateur, pour la retrouver en revenant sur la page.
 */
export default function MatricePiliers({ compte, marqueOk, onAjoutes, onQuota }) {
  const { t } = useTranslation();
  const memo = `plan-matrice:${compte || 'anonyme'}`;
  const [matrice, setMatrice] = useState(null); // { piliers, formats, idees }
  const [choisies, setChoisies] = useState(() => new Set());
  const [ajoutees, setAjoutees] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(memo) || 'null');
      if (m?.idees?.length) {
        setMatrice(m);
        setAjoutees(new Set(m.ajoutees || []));
      }
    } catch (e) {
      // stockage indisponible : la matrice repart de zéro
    }
  }, [memo]);
  const garder = (m, deja) => {
    try { localStorage.setItem(memo, JSON.stringify({ ...m, ajoutees: [...deja] })); } catch (e) { /* stockage plein ou bloqué */ }
  };

  const remplir = async () => {
    if (!marqueOk) { toast.error(t('plan.toastSecteurRequis')); return; }
    setEnCours(true);
    try {
      const d = await agentService.matrice();
      const m = { piliers: d.piliers || [], formats: d.formats || [], idees: d.idees || [] };
      setMatrice(m);
      setChoisies(new Set());
      setAjoutees(new Set());
      garder(m, new Set());
      onQuota?.();
    } catch (e) {
      if (!e?.__handled) toast.error(e?.response?.data?.message || e?.response?.data?.detail || t('plan.matrice.erreur'));
    } finally {
      setEnCours(false);
    }
  };

  const basculer = (i) => {
    const k = cleCase(i);
    if (ajoutees.has(k)) return;
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };
  const libres = matrice ? matrice.idees.filter((i) => !ajoutees.has(cleCase(i))) : [];
  const toutChoisir = () => setChoisies(choisies.size === libres.length ? new Set() : new Set(libres.map(cleCase)));

  const ajouter = async () => {
    const liste = matrice.idees.filter((i) => choisies.has(cleCase(i)));
    if (!liste.length) return;
    setAjoutEnCours(true);
    try {
      const d = await agentService.ajouterSujets(liste.map(({ sujet, pilier, format, objectif, angle }) => ({ sujet, pilier, format, objectif, angle })));
      const deja = new Set([...ajoutees, ...choisies]);
      setAjoutees(deja);
      setChoisies(new Set());
      garder(matrice, deja);
      onAjoutes?.(d.sujets || []);
      toast.success(t('plan.matrice.ajoutees', { count: liste.length }));
    } catch (e) {
      if (!e?.__handled) toast.error(e?.response?.data?.message || t('plan.matrice.erreurAjout'));
    } finally {
      setAjoutEnCours(false);
    }
  };

  const idee = (pilier, format) => matrice.idees.find((i) => i.pilier === pilier && i.format === format);
  const Case = ({ i, avecFormat }) => {
    if (!i) return <span className="block text-center text-slate-600 text-[13px]" aria-label={t('plan.matrice.vide')}>—</span>;
    const k = cleCase(i);
    const ajoutee = ajoutees.has(k);
    const on = choisies.has(k);
    return (
      <button type="button" onClick={() => basculer(i)} aria-pressed={ajoutee || on} disabled={ajoutee}
        data-testid={`plan-matrice-case-${matrice.piliers.indexOf(i.pilier)}-${matrice.formats.indexOf(i.format)}`}
        className={`w-full h-full text-left rounded-xl border px-3 py-2.5 transition-colors ${FOCUS} ${
          ajoutee ? 'border-[#3AFFA3]/30 bg-[#3AFFA3]/[0.05] cursor-default'
            : on ? 'border-[#8A6CFF] bg-[#6f5cff]/[0.12]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/25'}`}>
        <span className="flex items-start gap-2">
          <span className={`mt-0.5 w-4 h-4 flex-none rounded border grid place-items-center ${ajoutee ? 'border-[#3AFFA3] bg-[#3AFFA3] text-[#0b1322]' : on ? 'border-[#8A6CFF] bg-[#8A6CFF] text-white' : 'border-white/30'}`} aria-hidden="true">
            {(on || ajoutee) && <Check className="w-3 h-3" strokeWidth={3} />}
          </span>
          <span className="min-w-0">
            {avecFormat && <span className="block text-[11px] uppercase tracking-wider text-slate-400 mb-0.5">{i.format}</span>}
            <span className="block text-[13px] leading-snug text-slate-100">{i.sujet}</span>
            {ajoutee
              ? <span className="block mt-1 text-[11.5px] text-[#7ff5c4]">{t('plan.matrice.dansSujets')}</span>
              : i.angle && <span className="block mt-1 text-[11.5px] text-slate-400">{i.angle}</span>}
          </span>
        </span>
      </button>
    );
  };

  return (
    <section aria-labelledby="plan-matrice-titre" className="rounded-2xl border border-white/[0.08] bg-[#0b1326] p-4 mb-4 font-inter" data-testid="plan-matrice">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 id="plan-matrice-titre" className="flex items-center gap-2 font-sora font-bold text-[15.5px] text-white">
            <Grid3x3 className="w-4 h-4 text-[#a594ff]" aria-hidden="true" />{t('plan.matrice.titre')}
          </h3>
          <p className="mt-1 text-[13px] text-slate-300 max-w-[70ch]">{t('plan.matrice.aide')}</p>
        </div>
        <button type="button" onClick={remplir} disabled={enCours || !marqueOk} data-testid="plan-matrice-remplir"
          className={`inline-flex items-center gap-2 h-10 px-4 rounded-[10px] text-[13px] font-semibold border border-white/15 text-slate-100 hover:bg-white/[0.06] disabled:opacity-40 ${FOCUS}`}>
          {enCours ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Grid3x3 className="w-4 h-4" aria-hidden="true" />}
          {enCours ? t('plan.matrice.enCours') : matrice ? t('plan.matrice.refaire') : t('plan.matrice.remplir')}
        </button>
      </div>

      {matrice && (
        <>
          {/* Grand écran : le tableau piliers (lignes) × formats (colonnes) */}
          <div className="hidden md:block mt-4 overflow-x-auto [scrollbar-width:thin]">
            <table className="w-full border-separate border-spacing-1.5 table-fixed" style={{ minWidth: `${130 + matrice.formats.length * 150}px` }}>
              <caption className="sr-only">{t('plan.matrice.titre')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-[120px] text-left text-[12px] font-medium text-slate-400 px-1">{t('plan.matrice.pilier')}</th>
                  {matrice.formats.map((f) => <th key={f} scope="col" className="text-left text-[12px] font-semibold text-slate-200 px-1">{f}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrice.piliers.map((p) => (
                  <tr key={p}>
                    <th scope="row" className="align-top text-left text-[13px] font-semibold text-white px-1 pt-2.5">{p}</th>
                    {matrice.formats.map((f) => <td key={f} className="align-top h-full"><Case i={idee(p, f)} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile : un groupe par pilier, le format écrit sur chaque idée */}
          <div className="md:hidden mt-4 space-y-4">
            {matrice.piliers.map((p) => (
              <div key={p}>
                <h4 className="text-[13px] font-semibold text-white mb-2">{p}</h4>
                <ul className="grid gap-2">
                  {matrice.formats.map((f) => idee(p, f) && <li key={f}><Case i={idee(p, f)} avecFormat /></li>)}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-slate-300 tabular-nums" aria-live="polite">{t('plan.matrice.choisies', { count: choisies.size })}</span>
            {libres.length > 0 && (
              <button type="button" onClick={toutChoisir} className={`text-[13px] text-[#c9c1ff] hover:text-white underline underline-offset-2 rounded ${FOCUS}`}>
                {choisies.size === libres.length ? t('plan.matrice.rienChoisir') : t('plan.matrice.toutChoisir')}
              </button>
            )}
            <button type="button" onClick={ajouter} disabled={!choisies.size || ajoutEnCours} data-testid="plan-matrice-ajouter"
              className={`sm:ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-[10px] text-[13px] font-semibold bg-[#5a4ae8] text-white hover:bg-[#6757f0] disabled:opacity-40 ${FOCUS}`}>
              {ajoutEnCours ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
              {t('plan.matrice.ajouter', { count: choisies.size })}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
