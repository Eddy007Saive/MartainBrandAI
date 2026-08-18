import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Globe, Sparkles, Loader2 } from 'lucide-react';

import { Button } from './ui/button';
import { ChargementRico } from './ChargementRico';
import { Input } from './ui/input';
import { userService } from '../services/userService';

// Partir d'une page blanche est l'endroit où l'on perd les gens. Le client colle
// l'adresse de son site, on la lit et on lui propose sa fiche pré-remplie ;
// il corrige au lieu d'inventer.

// Les listes reviennent en tableaux, les champs du formulaire sont des textes.
const enTexte = (v) => (Array.isArray(v) ? v.join('\n') : v || '');

const CHAMPS = ['secteur', 'audience', 'voix_marque', 'piliers', 'hooks', 'ctas', 'a_eviter',
  'couleur_principale', 'couleur_secondaire', 'couleur_accent'];

export default function RemplirDepuisSite({ user, onChange }) {
  const { t, i18n } = useTranslation();
  const [url, setUrl] = useState('');
  const [analyse, setAnalyse] = useState(false);
  const [fiche, setFiche] = useState(null);

  const lancer = async () => {
    if (!url.trim()) return toast.error(t('analyseSite.adresseRequise'));
    setAnalyse(true);
    setFiche(null);
    try {
      const f = await userService.analyserSite(url.trim(), (i18n.resolvedLanguage || 'fr').slice(0, 2));
      setFiche(f);
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('analyseSite.echec'));
    } finally {
      setAnalyse(false);
    }
  };

  // Par défaut on ne remplit que le vide : ce que le client a déjà écrit vaut
  // toujours mieux qu'une déduction faite à partir de son site.
  const appliquer = (toutRemplacer) => {
    const remplis = CHAMPS.filter((c) => {
      const propose = enTexte(fiche[c]);
      if (!propose) return false;
      if (!toutRemplacer && String(user?.[c] || '').trim()) return false;
      onChange(c, propose);
      return true;
    });
    if (!remplis.length) return toast.info(t('analyseSite.rienAremplir'));
    toast.success(t('analyseSite.champsRemplis', { count: remplis.length }));
    setFiche(null);
  };

  const dejaRempli = fiche && CHAMPS.some((c) => String(user?.[c] || '').trim());

  return (
    <section className="rounded-2xl border border-[#5B6CFF]/25 bg-[#5B6CFF]/[0.05] p-5">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-4 h-4 text-[#5B6CFF]" />
        <span className="text-[13.5px] font-semibold text-white font-sora">{t('analyseSite.titre')}</span>
      </div>
      <p className="text-[12.5px] text-slate-400 font-inter mb-3.5">{t('analyseSite.description')}</p>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={analyse}
          onKeyDown={(e) => e.key === 'Enter' && !analyse && lancer()}
          placeholder="monentreprise.fr" data-testid="site-url" className="flex-1" />
        <Button onClick={lancer} disabled={analyse} data-testid="site-analyser"
          className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] flex-shrink-0">
          {analyse
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('analyseSite.lecture')}</>
            : <><Sparkles className="w-4 h-4 mr-2" />{t('analyseSite.analyser')}</>}
        </Button>
      </div>
      {/* Trente secondes sans rien voir, c'est long. Rico raconte ce qu'il fait. */}
      {analyse && (
        <ChargementRico className="mt-4" etapes={[
          { pose: 'lit-tablette', jusqua: 7, texte: t('analyseSite.etape.ouvrir'), parole: t('analyseSite.parole.ouvrir') },
          { pose: 'ecrans-data', jusqua: 17, texte: t('analyseSite.etape.lire'), parole: t('analyseSite.parole.lire') },
          { pose: 'ecrans-action', jusqua: 30, texte: t('analyseSite.etape.deduire'), parole: t('analyseSite.parole.deduire') },
          { pose: 'presente-data', jusqua: 9999, texte: t('analyseSite.etape.preparer'), parole: t('analyseSite.parole.preparer') },
        ]} />
      )}

      {fiche && (
        <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4" data-testid="site-proposition">
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500 font-semibold font-inter mb-3">
            {t('analyseSite.proposition')}
          </div>
          <dl className="space-y-2.5 text-[13px] font-inter">
            {[['secteur', fiche.secteur], ['audience', fiche.audience], ['voix_marque', fiche.voix_marque],
              ['piliers', enTexte(fiche.piliers)], ['hooks', enTexte(fiche.hooks)], ['ctas', enTexte(fiche.ctas)]]
              .filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-slate-500 uppercase tracking-wide">{t(`analyseSite.champ.${k}`)}</dt>
                  <dd className="text-slate-300 whitespace-pre-line">{v}</dd>
                </div>
              ))}
          </dl>

          {fiche.couleur_principale && (
            <div className="flex items-center gap-2 mt-3.5">
              <span className="text-[11px] text-slate-500 uppercase tracking-wide">{t('analyseSite.champ.couleurs')}</span>
              {[fiche.couleur_principale, fiche.couleur_secondaire, fiche.couleur_accent]
                .filter(Boolean).map((c) => (
                  <span key={c} className="flex items-center gap-1.5 text-[11.5px] text-slate-400 font-mono">
                    <span className="w-4 h-4 rounded border border-white/15" style={{ background: c }} />{c}
                  </span>
                ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button onClick={() => appliquer(false)} data-testid="site-appliquer"
              className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]">
              {t('analyseSite.utiliser')}
            </Button>
            {dejaRempli && (
              <button onClick={() => appliquer(true)} data-testid="site-remplacer"
                className="text-[12.5px] text-slate-400 hover:text-white font-inter underline underline-offset-2">
                {t('analyseSite.toutRemplacer')}
              </button>
            )}
            <button onClick={() => setFiche(null)} className="text-[12.5px] text-slate-500 hover:text-slate-300 font-inter">
              {t('analyseSite.ignorer')}
            </button>
          </div>
          <p className="text-[11.5px] text-slate-500 font-inter mt-3">{t('analyseSite.rappelEnregistrer')}</p>
        </div>
      )}
    </section>
  );
}
