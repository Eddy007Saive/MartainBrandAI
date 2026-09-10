import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Loader2, Sparkles, Check, Type } from 'lucide-react';
import { contenuService } from '../services/contenuService';

/**
 * Miniature (couverture) d'un reel : un gabarit, trois textes, une image IA en fond
 * et le texte posé par nous (net, sans faute, aux couleurs de la marque).
 *
 * Deux boutons : « Générer » fabrique un fond neuf (une image du quota) ;
 * « Changer le texte » recompose sur le même fond (gratuit).
 * La miniature devient la couverture du reel dans Contenus, et part à Instagram.
 */
const APERCUS = {
  // Mini-maquettes CSS des dispositions de texte, pour choisir sans générer.
  'titre-bas':  { fond: 'linear-gradient(180deg,#334155 0%,#0b1120 100%)', blocs: [['k', 'bottom-[26%]'], ['t', 'bottom-[12%]'], ['s', 'bottom-[6%]']], align: 'text-left px-2' },
  'coin':       { fond: 'linear-gradient(160deg,#7c2d12 0%,#0b1120 70%)', blocs: [['t', 'top-[8%]']], align: 'text-left px-2' },
  'centre':     { fond: 'radial-gradient(circle at 50% 40%,#5b6cff55,#0b1120 70%)', blocs: [['t', 'top-[40%]'], ['c', 'top-[55%]']], align: 'text-center px-1' },
  'geant':      { fond: 'linear-gradient(180deg,#0ea5e9,#0369a1)', blocs: [['g', 'top-[36%]']], align: 'text-center' },
  'haut-neon':  { fond: 'linear-gradient(180deg,#020617 0%,#312e81 100%)', blocs: [['n', 'top-[8%]'], ['s', 'top-[24%]']], align: 'text-center px-1' },
  'bande':      { fond: 'linear-gradient(180deg,#1e293b 0%,#1e293b 45%,#475569 55%,#0b1120 100%)', blocs: [['f', 'top-[42%]'], ['k', 'top-[58%]']], align: 'text-center px-1' },
  'mot-geant':  { fond: 'linear-gradient(180deg,#000 0%,#1c1917 100%)', blocs: [['k', 'top-[10%]'], ['g2', 'top-[20%]']], align: 'text-center px-1' },
  'aucun':      { fond: 'linear-gradient(180deg,#fde68a,#f59e0b)', blocs: [], align: '' },
};
const BLOC_CLS = {
  k: 'text-[5px] tracking-[.2em] uppercase text-white/80 font-semibold',
  t: 'text-[11px] font-extrabold uppercase leading-[1] text-white font-sora',
  s: 'text-[6px] font-extrabold uppercase text-[#3AFFA3]',
  c: 'text-[8px] italic text-[#3AFFA3]',
  g: 'text-[14px] italic font-black uppercase leading-[.9] text-white -rotate-6 font-sora drop-shadow',
  n: 'text-[10px] font-black uppercase text-[#3AFFA3] font-sora [text-shadow:0_0_6px_#3AFFA3]',
  f: 'text-[10px] font-serif text-white leading-none',
  g2: 'text-[16px] font-black uppercase text-white font-sora leading-none',
};

export default function MiniatureDialog({ contenu, onClose, onDone }) {
  const { t } = useTranslation();
  const [gabarits, setGabarits] = useState([]);
  const [gabarit, setGabarit] = useState('affiche');
  const [textes, setTextes] = useState({ kicker: '', titre: '', sous: '', objet: '' });
  const [ratio, setRatio] = useState('9:16');
  const [styles, setStyles] = useState(['photo', 'cinema', '3d', 'illustration', 'neon', 'pop']);
  const [styleImg, setStyleImg] = useState('photo');
  const [polices, setPolices] = useState([]);
  const [police, setPolice] = useState(null);   // null = celle du gabarit
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState(null);   // 'fond' | 'texte' | null
  const [mini, setMini] = useState(contenu?.reel_data?.miniature || null);

  useEffect(() => {
    if (!contenu) return undefined;
    let vivant = true;
    setChargement(true);
    const existante = contenu.reel_data?.miniature;
    Promise.all([
      contenuService.miniatureGabarits(),
      existante?.textes ? Promise.resolve(existante.textes) : contenuService.miniatureTextes(contenu.id),
    ]).then(([g, tx]) => {
      if (!vivant) return;
      setGabarits(g.gabarits || []);
      if (g.styles?.length) setStyles(g.styles);
      if (g.polices?.length) {
        setPolices(g.polices);
        // Les polices, une seule fois, pour que les pastilles s'affichent dans leur propre caractère.
        if (!document.getElementById('miniature-polices')) {
          const l = document.createElement('link'); l.id = 'miniature-polices'; l.rel = 'stylesheet';
          l.href = 'https://fonts.googleapis.com/css2?' + g.polices.map((x) => 'family=' + encodeURIComponent(x.famille).replace(/%20/g, '+')).join('&') + '&display=swap';
          document.head.appendChild(l);
        }
      }
      setTextes({ kicker: '', titre: '', sous: '', objet: '', ...(tx || {}) });
      if (existante) { setGabarit(existante.gabarit); setRatio(existante.ratio || '9:16'); setStyleImg(existante.style || 'photo'); setPolice(existante.police || null); }
    }).catch(() => { if (vivant) toast.error(t('contenus.miniature.echecTextes')); })
      .finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
  }, [contenu, t]);

  if (!contenu) return null;
  const g = gabarits.find((x) => x.id === gabarit) || { id: gabarit, layout: 'titre-bas', textes: ['kicker', 'titre', 'sous'] };
  const champs = g.textes || [];
  const policeEffective = police || g.police || 'impact';
  const peutRecomposer = !!mini?.fond && mini.gabarit === gabarit && mini.ratio === ratio && (mini.style || 'photo') === styleImg;

  const lancer = async (mode) => {
    if (champs.includes('titre') && !textes.titre.trim() && g.layout !== 'aucun') { toast.error(t('contenus.miniature.titreRequis')); return; }
    setGeneration(mode);
    try {
      const r = await contenuService.miniatureGenerer(contenu.id, { gabarit, textes, ratio, style: styleImg, police: policeEffective, reutiliser_fond: mode === 'texte' });
      setMini(r.miniature);
      toast.success(t(mode === 'texte' ? 'contenus.miniature.texteOk' : 'contenus.miniature.ok'));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.detail || t('contenus.miniature.echec'));
    } finally { setGeneration(null); }
  };
  const terminer = () => { onDone?.(mini); onClose(); };

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-[#020617]/85 backdrop-blur-md overflow-y-auto" onClick={onClose} data-testid="miniature-dialog">
      <div className="min-h-full grid place-items-center p-3 sm:p-6">
        <div className="w-full max-w-[1040px] rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {/* En-tête */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#5B6CFF]/20 to-[#8A6CFF]/20 border border-[#5B6CFF]/20 grid place-items-center">
              <Sparkles className="w-4 h-4 text-[#8A6CFF]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-sora font-bold text-white text-[17px] leading-tight">{t('contenus.miniature.titre')}</h2>
              <p className="text-[12.5px] text-slate-400 font-inter truncate">{contenu.titre}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t('contenus.actions.annuler')} data-testid="miniature-fermer"
              className="ml-auto w-9 h-9 rounded-lg border border-white/10 grid place-items-center text-slate-400 hover:text-white hover:border-white/25">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 p-5">
            {/* Gabarits */}
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2.5">{t('contenus.miniature.gabarits')}</div>
              <div className="grid grid-cols-4 gap-3">
                {(gabarits.length ? gabarits : Object.keys(APERCUS).map((l) => ({ id: l, layout: l }))).map((x) => {
                  const a = APERCUS[x.layout] || APERCUS['titre-bas'];
                  const on = gabarit === x.id;
                  return (
                    <button key={x.id} type="button" onClick={() => setGabarit(x.id)} data-testid={`miniature-gabarit-${x.id}`}
                      className={`group text-left transition-transform hover:-translate-y-0.5 ${on ? '' : 'opacity-90'}`}>
                      <div className={`relative aspect-[9/16] rounded-xl overflow-hidden border-[1.5px] ${on ? 'border-[#3AFFA3] shadow-[0_0_0_1.5px_#3AFFA3]' : 'border-white/10 group-hover:border-[#8A6CFF]/60'}`}
                        style={{ background: a.fond }}>
                        <div className="absolute inset-x-[18%] bottom-0 top-[35%] rounded-t-full bg-black/35" />
                        {a.blocs.map(([k, pos]) => (
                          <div key={k} className={`absolute inset-x-0 ${pos} ${a.align} ${BLOC_CLS[k]}`}>
                            {k === 'k' ? 'KICKER' : k === 's' ? 'SOUS-TITRE' : k === 'c' ? 'accroche' : 'TITRE'}
                          </div>
                        ))}
                        {on && <span className="absolute right-1.5 bottom-1.5 w-5 h-5 rounded-full bg-[#3AFFA3] text-[#05261a] grid place-items-center text-[10px] font-extrabold">✓</span>}
                      </div>
                      <div className={`mt-1.5 text-center text-[11.5px] font-sora font-bold truncate ${on ? 'text-[#3AFFA3]' : 'text-slate-300'}`}>
                        {t(`contenus.miniature.gab.${x.id}`)}
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Le style de l'image : le gabarit dit quoi montrer, le style dit comment */}
              <div className="mt-4">
                <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.miniature.styleImage')}</div>
                <div className="flex flex-wrap gap-2">
                  {styles.map((st) => (
                    <button key={st} type="button" onClick={() => setStyleImg(st)} data-testid={`miniature-style-${st}`} title={t(`contenus.miniature.styles.${st}Desc`)}
                      className={`px-3 py-1.5 rounded-lg text-[12.5px] font-inter font-semibold border ${styleImg === st ? 'border-[#3AFFA3] text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-300 hover:border-white/25'}`}>
                      {t(`contenus.miniature.styles.${st}`)}
                    </button>
                  ))}
                </div>
              </div>
              {/* La police du titre : chaque gabarit a la sienne, le client peut en changer */}
              {polices.length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-2">{t('contenus.miniature.police')}</div>
                  <div className="flex flex-wrap gap-2">
                    {polices.map((po) => {
                      const on = policeEffective === po.id;
                      return (
                        <button key={po.id} type="button" onClick={() => setPolice(po.id === (g.police || 'impact') ? null : po.id)} data-testid={`miniature-police-${po.id}`}
                          style={{ fontFamily: `'${po.famille}', sans-serif` }}
                          className={`px-3 py-1.5 rounded-lg text-[15px] leading-none border ${on ? 'border-[#3AFFA3] text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-200 hover:border-white/25'}`}>
                          {t(`contenus.miniature.polices.${po.id}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-[11.5px] text-slate-500 font-inter mt-3 leading-snug">{t('contenus.miniature.aide')}</p>
            </div>

            {/* Réglages + résultat */}
            <div className="space-y-4">
              {chargement ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm font-inter"><Loader2 className="w-4 h-4 animate-spin" />{t('contenus.miniature.chargement')}</div>
              ) : (
                <>
                  {champs.includes('kicker') && (
                    <Champ label={t('contenus.miniature.kicker')} valeur={textes.kicker} max={30} testid="miniature-kicker"
                      onChange={(v) => setTextes((x) => ({ ...x, kicker: v }))} />
                  )}
                  {champs.includes('titre') && (
                    <Champ label={t('contenus.miniature.titreTexte')} valeur={textes.titre} max={50} testid="miniature-titre"
                      onChange={(v) => setTextes((x) => ({ ...x, titre: v }))} />
                  )}
                  {champs.includes('sous') && (
                    <Champ label={t('contenus.miniature.sous')} valeur={textes.sous} max={50} testid="miniature-sous"
                      onChange={(v) => setTextes((x) => ({ ...x, sous: v }))} />
                  )}
                  {champs.includes('objet') && (
                    <Champ label={t('contenus.miniature.objet')} valeur={textes.objet} max={60} testid="miniature-objet"
                      aide={t('contenus.miniature.objetAide')} onChange={(v) => setTextes((x) => ({ ...x, objet: v }))} />
                  )}
                  <div>
                    <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-1.5">{t('contenus.miniature.format')}</div>
                    <div className="flex gap-2">
                      {[['9:16', t('contenus.miniature.f916')], ['16:9', t('contenus.miniature.f169')]].map(([r, lib]) => (
                        <button key={r} type="button" onClick={() => setRatio(r)} data-testid={`miniature-ratio-${r.replace(':', '')}`}
                          className={`px-3 py-1.5 rounded-lg text-[12.5px] font-inter font-semibold border ${ratio === r ? 'border-[#3AFFA3] text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-300 hover:border-white/25'}`}>
                          {lib}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {mini?.url && (
                <div className="rounded-xl border border-white/10 overflow-hidden bg-black/40" data-testid="miniature-apercu">
                  <img src={mini.url} alt="" className={`w-full ${mini.ratio === '16:9' ? 'aspect-video' : 'aspect-[9/16] max-h-[420px]'} object-contain mx-auto`} />
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => lancer('fond')} disabled={!!generation || chargement} data-testid="miniature-generer"
                  className="w-full inline-flex items-center justify-center gap-2 text-[13.5px] font-semibold font-inter text-white px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90 disabled:opacity-50">
                  {generation === 'fond' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generation === 'fond' ? t('contenus.miniature.enCours') : mini ? t('contenus.miniature.regenerer') : t('contenus.miniature.generer')}
                </button>
                {peutRecomposer && (
                  <button type="button" onClick={() => lancer('texte')} disabled={!!generation} data-testid="miniature-texte"
                    className="w-full inline-flex items-center justify-center gap-2 text-[12.5px] font-semibold font-inter text-slate-200 px-4 py-2 rounded-xl border border-white/10 hover:border-white/25 disabled:opacity-50">
                    {generation === 'texte' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
                    {t('contenus.miniature.changerTexte')}
                  </button>
                )}
                {mini?.url && (
                  <button type="button" onClick={terminer} data-testid="miniature-terminer"
                    className="w-full inline-flex items-center justify-center gap-2 text-[12.5px] font-semibold font-inter text-[#3AFFA3] px-4 py-2 rounded-xl border border-[#3AFFA3]/40 hover:bg-[#3AFFA3]/10">
                    <Check className="w-4 h-4" />{t('contenus.miniature.terminer')}
                  </button>
                )}
                <p className="text-[11px] text-slate-500 font-inter text-center">{t('contenus.miniature.cout')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Champ({ label, valeur, onChange, max, testid, aide }) {
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-1.5">{label}</div>
      <input value={valeur} onChange={(e) => onChange(e.target.value)} maxLength={max} data-testid={testid}
        className="w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#5B6CFF]/50" />
      {aide && <p className="text-[11px] text-slate-600 font-inter mt-1">{aide}</p>}
    </div>
  );
}
