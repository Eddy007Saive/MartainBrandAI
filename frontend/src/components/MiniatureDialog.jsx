import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Loader2, Sparkles, Check, Type, User, Plus, Wand2, ArrowUp, History, LayoutGrid } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { contenuService } from '../services/contenuService';
import { userService } from '../services/userService';
import { useUser } from '../context/UserContext';

/**
 * Miniature (couverture) d'un reel : un gabarit, trois textes, une image IA en fond
 * et le texte posé par nous (net, sans faute, aux couleurs de la marque).
 *
 * « Générer » / « Nouveau fond » fabrique un fond neuf (une image du quota) ;
 * « 3 propositions » en fabrique trois (trois images) et le client garde sa préférée ;
 * « Changer le texte » recompose sur le même fond (gratuit), couleur du titre comprise.
 * Les 3 versions précédentes restent disponibles (« Revenir »), recomposées sur leur fond.
 * La miniature devient la couverture du reel dans Contenus, et part à Instagram.
 *
 * Fenêtre Radix : elle s'ouvre par-dessus la fiche du contenu (elle-même une fenêtre
 * Radix). Imbriquée ainsi, Radix gère la pile : clics, saisie, focus et Échap vont à
 * la fenêtre du dessus. (Avant : un simple portail, dont la fiche bloquait les clics.)
 */
const APERCUS = {
  // Mini-maquettes CSS des dispositions de texte, si l'image d'exemple manque.
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

const ONGLETS = ['gabarits', 'style', 'sujet', 'police'];
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]';
// Sélection : le violet de l'app (le vert y marque une étape terminée, pas un choix).
const CADRE = (on) => (on ? 'border-[#8A6CFF] ring-2 ring-[#8A6CFF]/40' : 'border-white/10 group-hover:border-white/30');
const LEGENDE = (on) => (on ? 'text-white' : 'text-slate-400 group-hover:text-slate-200');
const BTN = `inline-flex items-center justify-center gap-2 whitespace-nowrap h-11 sm:h-10 px-4 rounded-[10px] text-[13px] font-semibold font-inter transition-colors duration-150 disabled:opacity-50 ${FOCUS}`;
const BTN_SECONDAIRE = `${BTN} border border-white/15 text-slate-100 hover:bg-white/[0.06]`;
const BTN_PRINCIPAL = `${BTN} bg-[#5a4ae8] text-white hover:bg-[#6757f0]`;

function Coche() {
  return (
    <span className="absolute z-[2] right-1.5 bottom-1.5 w-5 h-5 rounded-full bg-[#8A6CFF] text-white grid place-items-center" aria-hidden="true">
      <Check className="w-3 h-3" strokeWidth={3} />
    </span>
  );
}

export default function MiniatureDialog({ contenu, onClose, onDone, onGeneree }) {
  const { t } = useTranslation();
  const [onglet, setOnglet] = useState('gabarits');
  const [gabarits, setGabarits] = useState([]);
  const [gabarit, setGabarit] = useState('affiche');
  const [textes, setTextes] = useState({ kicker: '', titre: '', sous: '', objet: '' });
  const [ratio, setRatio] = useState('9:16');
  const [styles, setStyles] = useState(['photo', 'cinema', '3d', 'illustration', 'neon', 'pop'].map((id) => ({ id })));
  const [styleImg, setStyleImg] = useState('photo');
  const [polices, setPolices] = useState([]);
  const [police, setPolice] = useState(null);   // null = celle du gabarit
  const [inspirations, setInspirations] = useState([]);
  const [refUrl, setRefUrl] = useState(null);   // null = la photo du compte (Paramètres) ; sinon une image de la banque
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState(null);   // 'fond' | 'texte' | null
  const [mini, setMini] = useState(contenu?.reel_data?.miniature || null);
  // Créer un sujet (mascotte, personnage, objet) : décrit, généré, rangé dans la banque.
  const [creation, setCreation] = useState(false);
  const [description, setDescription] = useState('');
  const [styleSujet, setStyleSujet] = useState('3d');
  const [sujetEnCours, setSujetEnCours] = useState(false);
  // Retouche par consigne libre, une fois la miniature faite.
  const [consigne, setConsigne] = useState('');
  const [retoucheEnCours, setRetoucheEnCours] = useState(false);
  const [reponseIA, setReponseIA] = useState('');
  const consigneRef = useRef(null);
  const { user } = useUser();
  const [couleur, setCouleur] = useState(contenu?.reel_data?.miniature?.couleur || ''); // '' = celle du gabarit
  const [historique, setHistorique] = useState(contenu?.reel_data?.miniature_historique || []);
  const [variantes, setVariantes] = useState([]);   // propositions en attente de choix
  const [choixEnCours, setChoixEnCours] = useState(null);
  const [restaurEnCours, setRestaurEnCours] = useState(null);
  // Gabarits dont la vraie photo d'exemple a échoué au chargement : la maquette CSS prend le relais.
  const [apercusEnErreur, setApercusEnErreur] = useState(() => new Set());

  useEffect(() => {
    if (!contenu) return undefined;
    let vivant = true;
    setChargement(true);
    setMini(contenu.reel_data?.miniature || null);
    setHistorique(contenu.reel_data?.miniature_historique || []);
    setCouleur(contenu.reel_data?.miniature?.couleur || '');
    setVariantes([]);
    const existante = contenu.reel_data?.miniature;
    // Textes déjà connus (miniature faite, ou proposition mémorisée sur le reel) : pas d'appel IA.
    const memo = existante?.textes || contenu.reel_data?.miniature_textes;
    Promise.all([
      contenuService.miniatureGabarits(),
      memo?.titre ? Promise.resolve(memo) : contenuService.miniatureTextes(contenu.id),
      userService.listInspirations().catch(() => []),
    ]).then(([g, tx, insp]) => {
      if (!vivant) return;
      setGabarits(g.gabarits || []);
      if (g.styles?.length) setStyles(g.styles.map((x) => (typeof x === 'string' ? { id: x } : x)));
      if (g.polices?.length) {
        setPolices(g.polices);
        // Les polices, une seule fois, pour que les pastilles s'affichent dans leur propre caractère.
        if (!document.getElementById('miniature-polices')) {
          const l = document.createElement('link'); l.id = 'miniature-polices'; l.rel = 'stylesheet';
          l.href = 'https://fonts.googleapis.com/css2?' + g.polices.map((x) => 'family=' + encodeURIComponent(x.famille).replace(/%20/g, '+')).join('&') + '&display=swap';
          document.head.appendChild(l);
        }
      }
      setInspirations(Array.isArray(insp) ? insp : (insp?.images || []));
      setTextes({ kicker: '', titre: '', sous: '', objet: '', ...(tx || {}) });
      if (existante) {
        setGabarit(existante.gabarit); setRatio(existante.ratio || '9:16'); setStyleImg(existante.style || 'photo');
        setPolice(existante.police || null); setRefUrl(existante.ref || null);
      }
    }).catch(() => { if (vivant) toast.error(t('contenus.miniature.echecTextes')); })
      .finally(() => { if (vivant) setChargement(false); });
    return () => { vivant = false; };
  }, [contenu, t]);

  if (!contenu) return null;
  const listeGabarits = gabarits.length ? gabarits : Object.keys(APERCUS).map((l) => ({ id: l, layout: l }));
  const g = gabarits.find((x) => x.id === gabarit) || { id: gabarit, layout: 'titre-bas', textes: ['kicker', 'titre', 'sous'] };
  const champs = g.textes || [];
  const policeEffective = police || g.police || 'impact';
  const peutRecomposer = !!mini?.fond && mini.gabarit === gabarit && mini.ratio === ratio && (mini.style || 'photo') === styleImg && (mini.ref || null) === (refUrl || null);

  // Même règle que le serveur : la version remplacée passe en tête, 3 au plus.
  const remplacer = (nouvelle, restaurer = null) => {
    setHistorique((h) => [...(mini?.fond ? [mini] : []), ...h.filter((_, i) => i !== restaurer)].slice(0, 3));
    setMini(nouvelle);
    onGeneree?.(nouvelle);
  };
  const COULEURS = [
    ['', t('contenus.miniature.couleurGabarit')],
    ['#ffffff', t('contenus.miniature.couleurBlanc')],
    ['#ffd60a', t('contenus.miniature.couleurJaune')],
    [String(user?.couleur_accent || '#3AFFA3').toLowerCase(), t('contenus.miniature.couleurAccent')],
    [String(user?.couleur_principale || '#003D2E').toLowerCase(), t('contenus.miniature.couleurPrincipale')],
    [String(user?.couleur_secondaire || '#0077FF').toLowerCase(), t('contenus.miniature.couleurSecondaire')],
  ].filter(([c], i, l) => l.findIndex(([x]) => x === c) === i);

  const proposer3 = async () => {
    if (champs.includes('titre') && !textes.titre.trim() && g.layout !== 'aucun') { toast.error(t('contenus.miniature.titreRequis')); return; }
    setGeneration('variantes');
    try {
      const r = await contenuService.miniatureVariantes(contenu.id, { gabarit, textes, ratio, style: styleImg, police: policeEffective, ref: refUrl, couleur });
      setVariantes(r.variantes || []);
      if ((r.variantes || []).length < 3) toast.message(t('contenus.miniature.variantesPartielles', { count: (r.variantes || []).length }));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.message || e.response?.data?.detail || t('contenus.miniature.echec'));
    } finally { setGeneration(null); }
  };
  const choisir = async (v) => {
    setChoixEnCours(v.fond);
    try {
      const r = await contenuService.miniatureChoisir(contenu.id, v.fond);
      remplacer(r.miniature);
      setVariantes([]);
      toast.success(t('contenus.miniature.ok'));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.message || e.response?.data?.detail || t('contenus.miniature.echec'));
    } finally { setChoixEnCours(null); }
  };
  const restaurer = async (index) => {
    setRestaurEnCours(index);
    try {
      const r = await contenuService.miniatureRestaurer(contenu.id, index);
      remplacer(r.miniature, index);
      const m = r.miniature || {};
      setTextes((x) => ({ ...x, ...(m.textes || {}) }));
      if (m.gabarit) setGabarit(m.gabarit);
      setPolice(m.police || null); setCouleur(m.couleur || '');
      toast.success(t('contenus.miniature.restauree'));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.message || e.response?.data?.detail || t('contenus.miniature.echec'));
    } finally { setRestaurEnCours(null); }
  };

  const lancer = async (mode) => {
    if (champs.includes('titre') && !textes.titre.trim() && g.layout !== 'aucun') { toast.error(t('contenus.miniature.titreRequis')); return; }
    setGeneration(mode);
    try {
      const r = await contenuService.miniatureGenerer(contenu.id, { gabarit, textes, ratio, style: styleImg, police: policeEffective, ref: refUrl, couleur, reutiliser_fond: mode === 'texte' });
      remplacer(r.miniature);
      toast.success(t(mode === 'texte' ? 'contenus.miniature.texteOk' : 'contenus.miniature.ok'));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.detail || t('contenus.miniature.echec'));
    } finally { setGeneration(null); }
  };
  const terminer = () => { onDone?.(mini); onClose(); };

  const retoucher = async (texteConsigne) => {
    const c = (texteConsigne ?? consigne).trim();
    if (!c) return;
    setRetoucheEnCours(true); setReponseIA('');
    try {
      const r = await contenuService.miniatureRetoucher(contenu.id, { instruction: c });
      setHistorique((h) => [...(mini?.fond ? [mini] : []), ...h].slice(0, 3));
      setMini(r.miniature);
      // Les champs et la police suivent la retouche, pour pouvoir continuer à la main.
      setTextes((x) => ({ ...x, ...(r.miniature?.textes || {}) }));
      if (r.miniature?.police) setPolice(r.miniature.police);
      onGeneree?.(r.miniature);
      setReponseIA(r.reponse || t('contenus.miniature.retoucheOk'));
      setConsigne('');
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.message || e.response?.data?.detail || t('contenus.miniature.retoucheEchec'));
    } finally {
      setRetoucheEnCours(false);
      // Le champ était désactivé pendant la retouche : on y remet le curseur pour enchaîner.
      setTimeout(() => consigneRef.current?.focus(), 0);
    }
  };

  const creerSujet = async () => {
    if (!description.trim()) return;
    setSujetEnCours(true);
    try {
      const { url } = await contenuService.miniatureSujet({ description: description.trim(), style: styleSujet });
      const insp = await userService.listInspirations().catch(() => null);
      const liste = Array.isArray(insp) ? insp : (insp?.images || []);
      setInspirations(liste.includes(url) ? liste : [url, ...liste]);
      setRefUrl(url);
      setCreation(false); setDescription('');
      toast.success(t('contenus.miniature.sujetCree'));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.message || e.response?.data?.detail || t('contenus.miniature.sujetEchec'));
    } finally { setSujetEnCours(false); }
  };

  const onglets = ONGLETS.filter((o) => o !== 'police' || polices.length > 0);

  return (
    <Dialog open={!!contenu} onOpenChange={(o) => { if (!o && !generation && !sujetEnCours && !retoucheEnCours) onClose(); }}>
      <DialogContent sansFermeture data-testid="miniature-dialog" surcoucheClassName="bg-[#020617]/90"
        className="flex flex-col gap-0 p-0 outline-none focus:outline-none focus-visible:ring-0 w-[calc(100vw-1.5rem)] max-w-[1040px] h-[min(92dvh,820px)] rounded-2xl border-white/10 bg-[#0f172a] overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="min-w-0">
            <DialogTitle className="font-sora font-bold text-white text-[17px] leading-tight">{t('contenus.miniature.titre')}</DialogTitle>
            <DialogDescription className="text-[12.5px] text-slate-400 font-inter truncate mt-0.5">{contenu.titre}</DialogDescription>
          </div>
          <button type="button" onClick={onClose} disabled={!!generation} aria-label={t('contenus.miniature.fermer')} data-testid="miniature-fermer"
            className={`ml-auto shrink-0 w-10 h-10 rounded-lg grid place-items-center text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-40 ${FOCUS}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps : sur téléphone, un seul défilement ; sur grand écran, chaque colonne défile seule. */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 p-4 sm:p-5 lg:overflow-y-auto">
            <div role="tablist" aria-label={t('contenus.miniature.titre')} className="flex gap-1 p-1 bg-[#0a0f1c] border border-white/10 rounded-xl mb-4 overflow-x-auto">
              {onglets.map((o) => (
                <button key={o} type="button" role="tab" aria-selected={onglet === o} onClick={() => setOnglet(o)} data-testid={`miniature-onglet-${o}`}
                  className={`flex-1 min-w-[76px] h-9 rounded-lg text-[13px] font-inter font-semibold transition-colors duration-150 ${FOCUS} ${onglet === o ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:text-white'}`}>
                  {t(`contenus.miniature.onglet.${o}`)}
                </button>
              ))}
            </div>

            {onglet === 'gabarits' && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3">
                {listeGabarits.map((x) => {
                  const a = APERCUS[x.layout] || APERCUS['titre-bas'];
                  const on = gabarit === x.id;
                  return (
                    <button key={x.id} type="button" onClick={() => setGabarit(x.id)} aria-pressed={on} data-testid={`miniature-gabarit-${x.id}`}
                      className={`group text-left rounded-xl ${FOCUS}`}>
                      <div className={`relative aspect-[9/16] rounded-xl overflow-hidden border-[1.5px] transition-colors duration-150 ${CADRE(on)}`} style={{ background: a.fond }}>
                        {/* L'image d'exemple ; si elle manque (ou échoue), la maquette CSS prend le relais :
                            jamais les deux à la fois, sinon le texte générique de la maquette se superpose
                            au vrai style déjà dessiné dans la photo. */}
                        {x.apercu && !apercusEnErreur.has(x.id) ? (
                          <img src={x.apercu} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover z-[1]"
                            onError={() => setApercusEnErreur((s) => new Set(s).add(x.id))} />
                        ) : (
                          a.blocs.map(([k, pos]) => (
                            <div key={k} className={`absolute inset-x-0 ${pos} ${a.align} ${BLOC_CLS[k]}`}>
                              {k === 'k' ? 'KICKER' : k === 's' ? 'SOUS-TITRE' : k === 'c' ? 'accroche' : 'TITRE'}
                            </div>
                          ))
                        )}
                        {on && <Coche />}
                      </div>
                      <div className={`mt-1.5 text-center text-[12px] font-inter font-semibold truncate ${LEGENDE(on)}`}>
                        {t(`contenus.miniature.gab.${x.id}`)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {onglet === 'style' && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 sm:gap-3">
                {styles.map((st) => {
                  const on = styleImg === st.id;
                  return (
                    <button key={st.id} type="button" onClick={() => setStyleImg(st.id)} aria-pressed={on} data-testid={`miniature-style-${st.id}`}
                      className={`group text-center rounded-lg ${FOCUS}`}>
                      <div className={`relative aspect-[9/16] rounded-lg overflow-hidden border-[1.5px] bg-[#060b18] transition-colors duration-150 ${CADRE(on)}`}>
                        {st.apercu && <img src={st.apercu} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                        {on && <Coche />}
                      </div>
                      <div className={`mt-1.5 text-[12px] font-inter font-semibold truncate ${LEGENDE(on)}`}>{t(`contenus.miniature.styles.${st.id}`)}</div>
                      <div className="text-[11px] text-slate-400 font-inter leading-snug line-clamp-2 mt-0.5">{t(`contenus.miniature.styles.${st.id}Desc`, '')}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Le sujet : la photo du compte par défaut, ou une image de la banque (ex. la mascotte). */}
            {onglet === 'sujet' && (
              <div>
                <p className="text-[13.5px] text-slate-200 font-inter mb-3">{t('contenus.miniature.sujetQuestion')}</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 sm:gap-3 max-w-[560px]">
                  <button type="button" onClick={() => setRefUrl(null)} aria-pressed={!refUrl} data-testid="miniature-sujet-photo" className={`group text-center rounded-lg ${FOCUS}`}>
                    <div className={`relative aspect-[9/16] rounded-lg overflow-hidden border-[1.5px] bg-[#060b18] grid place-items-center transition-colors duration-150 ${CADRE(!refUrl)}`}>
                      <User className="w-5 h-5 text-slate-400" aria-hidden="true" />
                      {!refUrl && <Coche />}
                    </div>
                    <div className={`mt-1.5 text-[12px] font-inter font-semibold truncate ${LEGENDE(!refUrl)}`}>{t('contenus.miniature.sujetPhoto')}</div>
                  </button>
                  {inspirations.map((url) => {
                    const on = refUrl === url;
                    return (
                      <button key={url} type="button" onClick={() => setRefUrl(url)} aria-pressed={on} data-testid="miniature-sujet-ref" className={`group text-center rounded-lg ${FOCUS}`}>
                        <div className={`relative aspect-[9/16] rounded-lg overflow-hidden border-[1.5px] transition-colors duration-150 ${CADRE(on)}`}>
                          <img src={url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                          {on && <Coche />}
                        </div>
                      </button>
                    );
                  })}
                  {/* Créer une image : décrite ici, générée par l'IA, rangée dans la banque. */}
                  <button type="button" onClick={() => setCreation((v) => !v)} aria-expanded={creation} disabled={sujetEnCours}
                    data-testid="miniature-sujet-creer" aria-label={t('contenus.miniature.sujetCreerAide')} className={`group text-center rounded-lg ${FOCUS}`}>
                    <div className={`relative aspect-[9/16] rounded-lg border-[1.5px] border-dashed grid place-items-center transition-colors duration-150 ${creation ? 'border-[#8A6CFF] bg-[#8A6CFF]/10' : 'border-white/20 group-hover:border-white/40'}`}>
                      {sujetEnCours ? <Loader2 className="w-5 h-5 animate-spin text-slate-300" aria-hidden="true" /> : <Plus className="w-5 h-5 text-slate-300" aria-hidden="true" />}
                    </div>
                    <div className={`mt-1.5 text-[12px] font-inter font-semibold truncate ${LEGENDE(creation)}`}>{t('contenus.miniature.sujetCreer')}</div>
                  </button>
                </div>

                {creation && (
                  <div className="mt-4 max-w-[560px] rounded-xl border border-white/10 bg-white/[0.02] p-4" data-testid="miniature-sujet-form">
                    <label htmlFor="miniature-sujet-desc" className="block text-[13px] font-medium text-slate-200 font-inter">{t('contenus.miniature.sujetDecris')}</label>
                    <textarea id="miniature-sujet-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3}
                      placeholder={t('contenus.miniature.sujetExemple')} disabled={sujetEnCours} data-testid="miniature-sujet-description"
                      className={`mt-1.5 w-full resize-none bg-slate-950/60 border border-white/10 text-slate-100 text-[13.5px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#8A6CFF]/60 placeholder:text-slate-500 ${FOCUS}`} />
                    <fieldset className="mt-3">
                      <legend className="text-[13px] font-medium text-slate-300 font-inter mb-1.5">{t('contenus.miniature.sujetStyle')}</legend>
                      <div className="flex flex-wrap gap-2">
                        {styles.map((st) => (
                          <button key={st.id} type="button" onClick={() => setStyleSujet(st.id)} aria-pressed={styleSujet === st.id} disabled={sujetEnCours}
                            data-testid={`miniature-sujet-style-${st.id}`}
                            className={`h-9 px-3 rounded-lg text-[12.5px] font-inter font-semibold border transition-colors duration-150 ${FOCUS} ${styleSujet === st.id ? 'border-[#8A6CFF] text-white bg-[#8A6CFF]/10' : 'border-white/10 text-slate-300 hover:border-white/30'}`}>
                            {t(`contenus.miniature.styles.${st.id}`)}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button type="button" onClick={creerSujet} disabled={sujetEnCours || !description.trim()} data-testid="miniature-sujet-generer" className={`${BTN} border border-[#8A6CFF]/60 bg-[#8A6CFF]/15 text-white hover:bg-[#8A6CFF]/25`}>
                        {sujetEnCours ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                        {sujetEnCours ? t('contenus.miniature.sujetEnCours') : t('contenus.miniature.sujetGenerer')}
                      </button>
                      <p className="text-[12px] text-slate-400 font-inter">{t('contenus.miniature.sujetCout')}</p>
                    </div>
                  </div>
                )}

                <p className="text-[12.5px] text-slate-400 font-inter mt-4 max-w-[480px] leading-relaxed">
                  {inspirations.length > 0 ? t('contenus.miniature.sujetAide') : t('contenus.miniature.sujetAideVide')}
                </p>
              </div>
            )}

            {/* La police du titre : chaque gabarit a la sienne, le client peut en changer */}
            {onglet === 'police' && (
              <div className="flex flex-wrap gap-2.5">
                {polices.map((po) => {
                  const on = policeEffective === po.id;
                  return (
                    <button key={po.id} type="button" onClick={() => setPolice(po.id === (g.police || 'impact') ? null : po.id)} aria-pressed={on} data-testid={`miniature-police-${po.id}`}
                      style={{ fontFamily: `'${po.famille}', sans-serif` }}
                      className={`h-11 px-4 rounded-lg text-[16px] leading-none border transition-colors duration-150 ${FOCUS} ${on ? 'border-[#8A6CFF] ring-2 ring-[#8A6CFF]/40 text-white bg-[#8A6CFF]/10' : 'border-white/10 text-slate-200 hover:border-white/30'}`}>
                      {t(`contenus.miniature.polices.${po.id}`)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Aperçu, textes, format */}
          <aside className="min-w-0 p-4 sm:p-5 border-t lg:border-t-0 lg:border-l border-white/[0.06] lg:overflow-y-auto space-y-5">
            <figure className="m-0" data-testid="miniature-apercu">
              <div className={`relative mx-auto overflow-hidden rounded-xl border border-white/10 bg-black/40 ${ratio === '16:9' ? 'aspect-video w-full' : 'aspect-[9/16] w-[180px]'}`}>
                {mini?.url
                  ? <img src={mini.url} alt={t('contenus.miniature.taMiniature')} className="w-full h-full object-cover" />
                  : g.apercu && <img src={g.apercu} alt="" className="w-full h-full object-cover opacity-45" />}
                {(generation || retoucheEnCours) && (
                  <div className="absolute inset-0 grid place-items-center bg-[#020617]/70" role="status">
                    <span className="flex flex-col items-center gap-2 text-[12px] text-slate-200 font-inter">
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                      {t(retoucheEnCours ? 'contenus.miniature.retoucheEnCours' : generation === 'texte' ? 'contenus.miniature.enCoursTexte' : generation === 'variantes' ? 'contenus.miniature.variantesEnCours' : 'contenus.miniature.enCours')}
                    </span>
                  </div>
                )}
              </div>
              <figcaption className="mt-2 text-center text-[12px] text-slate-400 font-inter leading-snug [text-wrap:balance]">
                {mini?.url ? t('contenus.miniature.taMiniature') : t('contenus.miniature.exempleGabarit')}
              </figcaption>
            </figure>

            {/* Trois propositions : le client garde sa préférée, les autres sont supprimées. */}
            {variantes.length > 0 && (
              <section aria-labelledby="miniature-variantes-titre" data-testid="miniature-variantes" className="rounded-xl border border-[#8A6CFF]/40 bg-[#8A6CFF]/[0.06] p-3">
                <h3 id="miniature-variantes-titre" className="text-[13px] font-semibold text-white font-inter">{t('contenus.miniature.variantesTitre')}</h3>
                <div className={`mt-2 grid gap-2 ${ratio === '16:9' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                  {variantes.map((v, k) => (
                    <button key={v.fond} type="button" onClick={() => choisir(v)} disabled={!!choixEnCours} data-testid={`miniature-variante-${k + 1}`}
                      aria-label={t('contenus.miniature.garderVariante', { n: k + 1 })}
                      className={`group relative overflow-hidden rounded-lg border border-white/10 hover:border-[#8A6CFF] ${ratio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} ${FOCUS}`}>
                      <img src={v.url} alt="" className="w-full h-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[11px] font-inter font-semibold py-1">
                        {choixEnCours === v.fond ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" aria-hidden="true" /> : t('contenus.miniature.garder')}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Versions précédentes : un clic pour revenir en arrière (gratuit). */}
            {historique.length > 0 && (
              <section aria-labelledby="miniature-historique-titre" data-testid="miniature-historique">
                <h3 id="miniature-historique-titre" className="flex items-center gap-1.5 text-[13px] font-semibold text-white font-inter">
                  <History className="w-4 h-4 text-[#a594ff]" aria-hidden="true" />{t('contenus.miniature.historiqueTitre')}
                </h3>
                <ul className="mt-2 flex gap-2">
                  {historique.map((h, k) => (
                    <li key={h.fond + k}>
                      <button type="button" onClick={() => restaurer(k)} disabled={restaurEnCours !== null || !!generation} data-testid={`miniature-revenir-${k}`}
                        aria-label={t('contenus.miniature.revenirA', { titre: h.textes?.titre || '' })} title={h.textes?.titre || ''}
                        className={`relative block w-[58px] ${h.ratio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} overflow-hidden rounded-md border border-white/10 hover:border-[#8A6CFF] ${FOCUS}`}>
                        <img src={h.fond} alt="" className="w-full h-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-[9.5px] font-inter leading-tight px-1 py-0.5 line-clamp-2">
                          {restaurEnCours === k ? <Loader2 className="w-3 h-3 animate-spin mx-auto" aria-hidden="true" /> : (h.textes?.titre || t('contenus.miniature.revenir'))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Retoucher avec l'IA : une consigne libre, appliquée sur la miniature faite. */}
            {mini?.fond && (
              <section aria-labelledby="miniature-retouche-titre" data-testid="miniature-retouche">
                <h3 id="miniature-retouche-titre" className="flex items-center gap-1.5 text-[13px] font-semibold text-white font-inter">
                  <Wand2 className="w-4 h-4 text-[#a594ff]" aria-hidden="true" />{t('contenus.miniature.retoucheTitre')}
                </h3>
                <form className="mt-2 relative" onSubmit={(e) => { e.preventDefault(); retoucher(); }}>
                  <label htmlFor="miniature-retouche-consigne" className="sr-only">{t('contenus.miniature.retoucheTitre')}</label>
                  <textarea ref={consigneRef} id="miniature-retouche-consigne" value={consigne} onChange={(e) => setConsigne(e.target.value)} maxLength={500} rows={2}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); retoucher(); } }}
                    placeholder={t('contenus.miniature.retouchePlaceholder')} disabled={retoucheEnCours || !!generation} data-testid="miniature-retouche-consigne"
                    className={`w-full resize-none bg-slate-950/60 border border-white/10 text-slate-100 text-[13px] font-inter rounded-lg pl-3 pr-12 py-2 outline-none focus:border-[#8A6CFF]/60 placeholder:text-slate-500 ${FOCUS}`} />
                  <button type="submit" disabled={retoucheEnCours || !!generation || !consigne.trim()} aria-label={t('contenus.miniature.retoucheAppliquer')}
                    data-testid="miniature-retouche-appliquer"
                    className={`absolute right-2 bottom-2.5 w-8 h-8 rounded-md grid place-items-center bg-[#5a4ae8] text-white hover:bg-[#6757f0] disabled:opacity-40 ${FOCUS}`}>
                    {retoucheEnCours ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </form>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {['raccourcir', 'percutant', 'sombre', 'police'].map((k) => (
                    <button key={k} type="button" onClick={() => retoucher(t(`contenus.miniature.suggestion.${k}`))} disabled={retoucheEnCours || !!generation}
                      data-testid={`miniature-retouche-suggestion-${k}`}
                      className={`h-8 px-2.5 rounded-full text-[12px] font-inter text-slate-200 border border-white/10 hover:border-white/30 hover:text-white disabled:opacity-40 transition-colors duration-150 ${FOCUS}`}>
                      {t(`contenus.miniature.suggestion.${k}`)}
                    </button>
                  ))}
                </div>
                <p aria-live="polite" className={`mt-2 text-[12.5px] font-inter leading-snug ${reponseIA ? 'text-slate-200' : 'text-slate-400'}`} data-testid="miniature-retouche-reponse">
                  {reponseIA || t('contenus.miniature.retoucheAide')}
                </p>
              </section>
            )}

            {chargement ? (
              <div className="flex items-center gap-2 text-slate-300 text-[13px] font-inter" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />{t('contenus.miniature.chargement')}</div>
            ) : (
              <div className="space-y-4">
                {champs.includes('kicker') && (
                  <Champ id="miniature-kicker" label={t('contenus.miniature.kicker')} valeur={textes.kicker} max={30}
                    onChange={(v) => setTextes((x) => ({ ...x, kicker: v }))} />
                )}
                {champs.includes('titre') && (
                  <Champ id="miniature-titre" label={t('contenus.miniature.titreTexte')} valeur={textes.titre} max={50}
                    onChange={(v) => setTextes((x) => ({ ...x, titre: v }))} />
                )}
                {champs.includes('sous') && (
                  <Champ id="miniature-sous" label={t('contenus.miniature.sous')} valeur={textes.sous} max={50}
                    onChange={(v) => setTextes((x) => ({ ...x, sous: v }))} />
                )}
                {champs.includes('objet') && (
                  <Champ id="miniature-objet" label={t('contenus.miniature.objet')} valeur={textes.objet} max={60}
                    aide={t('contenus.miniature.objetAide')} onChange={(v) => setTextes((x) => ({ ...x, objet: v }))} />
                )}
                <fieldset>
                  <legend className="text-[13px] font-medium text-slate-300 font-inter mb-1.5">{t('contenus.miniature.format')}</legend>
                  <div className="flex gap-2">
                    {[['9:16', t('contenus.miniature.f916')], ['16:9', t('contenus.miniature.f169')]].map(([r, lib]) => (
                      <button key={r} type="button" onClick={() => setRatio(r)} aria-pressed={ratio === r} data-testid={`miniature-ratio-${r.replace(':', '')}`}
                        className={`h-10 px-3 rounded-lg text-[12.5px] font-inter font-semibold border transition-colors duration-150 ${FOCUS} ${ratio === r ? 'border-[#8A6CFF] text-white bg-[#8A6CFF]/10' : 'border-white/10 text-slate-300 hover:border-white/30'}`}>
                        {lib}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-[13px] font-medium text-slate-300 font-inter mb-1.5">{t('contenus.miniature.couleurTitre')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {COULEURS.map(([c, lib]) => (
                      <button key={c || 'gabarit'} type="button" onClick={() => setCouleur(c)} aria-pressed={couleur === c} title={lib} aria-label={lib}
                        data-testid={`miniature-couleur-${c ? c.slice(1) : 'gabarit'}`}
                        className={`w-9 h-9 rounded-full border-2 grid place-items-center ${FOCUS} ${couleur === c ? 'border-[#8A6CFF] ring-2 ring-[#8A6CFF]/40' : 'border-white/15 hover:border-white/40'}`}
                        style={c ? { background: c } : { background: 'conic-gradient(#fff 0 25%, #3AFFA3 0 50%, #ffd60a 0 75%, #5b6cff 0)' }}>
                        {couleur === c && <Check className={`w-4 h-4 ${['#ffffff', '#ffd60a', '#3affa3'].includes(c) ? 'text-[#0b1120]' : 'text-white'}`} strokeWidth={3} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                  {mini?.url && couleur !== (mini.couleur || '') && (
                    <p className="mt-1.5 text-[12px] text-slate-400 font-inter">{t('contenus.miniature.couleurAppliquer')}</p>
                  )}
                </fieldset>
              </div>
            )}
          </aside>
        </div>

        {/* Pied : toujours visible. Une fois la miniature faite, l'action principale est de
            l'utiliser ; refaire un fond (payant) devient secondaire. */}
        <div className="shrink-0 border-t border-white/10 px-4 sm:px-5 py-3 flex flex-col-reverse sm:flex-row sm:items-center gap-2.5 sm:gap-4">
          <p className="text-[12px] text-slate-400 font-inter sm:mr-auto sm:max-w-[38ch]">{t('contenus.miniature.cout')}</p>
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            {mini?.url ? (
              <>
                {peutRecomposer && (
                  <button type="button" onClick={() => lancer('texte')} disabled={!!generation} data-testid="miniature-texte" className={BTN_SECONDAIRE}>
                    {generation === 'texte' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Type className="w-4 h-4" aria-hidden="true" />}
                    {t('contenus.miniature.changerTexte')}
                  </button>
                )}
                <button type="button" onClick={() => lancer('fond')} disabled={!!generation || chargement} data-testid="miniature-generer"
                  className={`${BTN_SECONDAIRE} ${peutRecomposer ? '' : 'col-span-2'}`}>
                  {generation === 'fond' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                  {t('contenus.miniature.regenerer')}
                </button>
                <button type="button" onClick={proposer3} disabled={!!generation || chargement} data-testid="miniature-variantes-lancer"
                  title={t('contenus.miniature.variantesAide')} className={`${BTN_SECONDAIRE} col-span-2 sm:col-span-1`}>
                  {generation === 'variantes' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LayoutGrid className="w-4 h-4" aria-hidden="true" />}
                  {t('contenus.miniature.variantes')}
                </button>
                <button type="button" onClick={terminer} disabled={!!generation} data-testid="miniature-terminer" className={`${BTN_PRINCIPAL} col-span-2`}>
                  <Check className="w-4 h-4" strokeWidth={2.6} aria-hidden="true" />{t('contenus.miniature.terminer')}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={proposer3} disabled={!!generation || chargement} data-testid="miniature-variantes-lancer"
                  title={t('contenus.miniature.variantesAide')} className={`${BTN_SECONDAIRE} col-span-2 sm:col-span-1`}>
                  {generation === 'variantes' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <LayoutGrid className="w-4 h-4" aria-hidden="true" />}
                  {t('contenus.miniature.variantes')}
                </button>
                <button type="button" onClick={() => lancer('fond')} disabled={!!generation || chargement} data-testid="miniature-generer" className={`${BTN_PRINCIPAL} col-span-2`}>
                  {generation === 'fond' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                  {generation === 'fond' ? t('contenus.miniature.enCours') : t('contenus.miniature.generer')}
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Champ({ id, label, valeur, onChange, max, aide }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-slate-300 font-inter mb-1.5">{label}</label>
      <input id={id} value={valeur} onChange={(e) => onChange(e.target.value)} maxLength={max} data-testid={id}
        aria-describedby={aide ? `${id}-aide` : undefined}
        className={`w-full h-10 bg-slate-950/60 border border-white/10 text-slate-100 text-[13.5px] font-inter rounded-lg px-3 outline-none focus:border-[#8A6CFF]/60 ${FOCUS}`} />
      {aide && <p id={`${id}-aide`} className="text-[12px] text-slate-400 font-inter mt-1.5 leading-snug">{aide}</p>}
    </div>
  );
}
