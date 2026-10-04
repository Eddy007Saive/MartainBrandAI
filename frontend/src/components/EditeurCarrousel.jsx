import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage, Layer, Rect, Text, Shape, Line, Image as KImage, Transformer } from 'react-konva';
import { toast } from 'sonner';
import {
  X, Plus, Type, ImagePlus, Trash2, Copy, ChevronLeft, ChevronRight, Bold, AlignLeft, AlignCenter,
  AlignRight, Loader2, Save, Image as ImageIcon, LayoutTemplate, BringToFront, SendToBack, ArrowUp, ArrowDown,
  Undo2, Redo2, CopyPlus, Shapes, Square, Circle, Triangle, Star, Minus, MoveRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { contenuService } from '@/services/contenuService';
import { CAROUSEL_FONTS, CAROUSEL_BODY_FONTS } from '@/lib/carrouselPreview';
import { decomposerSlides } from '@/lib/decomposerSlides';
import { pagesDuModele } from '@/lib/modeleCarrousel';
import DialogueModeleCarrousel from '@/components/DialogueModeleCarrousel';
import {
  LARGEUR, HAUTEUR, nouvelId, designInitial, designDepuisSlides, designDepuisImage, chargerImage, chargerPolices,
  recadrage, exporterPage, lireImageLocale, texteSur, degradeKonva, styleTexte, attributsImage,
  attributsTexteRiche, estRiche, attributsForme, nouvelleForme, formeOuverte,
} from '@/lib/designCarrousel';

const POLICES = [...new Set([...CAROUSEL_FONTS, ...CAROUSEL_BODY_FONTS].map((f) => f.id).filter(Boolean))];
const SEUIL_AIMANT = 7;      // px à l'écran : distance où un élément s'aligne tout seul
const PAS_HISTORIQUE = 500;  // ms : les modifications rapprochées (frappe) forment une seule étape
const ICONES_FORMES = [['rect', Square], ['ellipse', Circle], ['triangle', Triangle], ['etoile', Star], ['ligne', Minus], ['fleche', MoveRight]];

function useImg(src) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    let actif = true;
    chargerImage(src).then((i) => actif && setImg(i));
    return () => { actif = false; };
  }, [src]);
  return img;
}

function FondImage({ src, w, h }) {
  const img = useImg(src);
  if (!img) return null;
  return <KImage image={img} x={0} y={0} width={w} height={h} {...recadrage(img, w, h)} listening={false} />;
}

function ElementImage({ el, interactif = true, refNode, ...evenements }) {
  const img = useImg(el.src);
  return (
    <KImage ref={refNode} image={img} x={el.x} y={el.y} width={el.width} height={el.height} rotation={el.rotation || 0}
      {...attributsImage(el, img)} draggable={interactif} listening={interactif} {...evenements} />
  );
}

/** Un élément de la page, à l'écran ou dans une miniature (non interactif). */
function Element({ el, interactif = true, refNode, ...evenements }) {
  if (el.type === 'image') return <ElementImage el={el} interactif={interactif} refNode={refNode} {...evenements} />;
  const commun = { ref: refNode, draggable: interactif, listening: interactif, ...evenements };
  if (el.type === 'forme') return <Shape {...attributsForme(el)} {...commun} />;
  if (estRiche(el)) return <Shape {...attributsTexteRiche(el)} {...commun} />;
  return (
    <Text x={el.x} y={el.y} width={el.width} text={el.text} fontSize={el.fontSize} fontFamily={el.fontFamily} fill={el.fill}
      fontStyle={styleTexte(el)} align={el.align} lineHeight={el.lineHeight || 1.2} letterSpacing={el.letterSpacing || 0}
      opacity={el.opacity ?? 1} rotation={el.rotation || 0} {...commun} />
  );
}

/** Miniature d'une page : le vrai rendu (fond, textes, images), réduit. */
function MiniPage({ page, W, H, largeur }) {
  const k = largeur / W;
  return (
    <Stage width={largeur} height={H * k} scaleX={k} scaleY={k} listening={false}>
      <Layer listening={false}>
        <Rect x={0} y={0} width={W} height={H} fill={page.fond || '#ffffff'} {...degradeKonva(page.degrade, W, H)} />
        {page.fondImage && <FondImage src={page.fondImage} w={W} h={H} />}
        {page.elements.map((el) => <Element key={el.id} el={el} interactif={false} />)}
      </Layer>
    </Stage>
  );
}

/** Design reçu d'un modèle enregistré : chaque page et chaque élément reçoivent un identifiant. */
const avecIds = (d) => ({ ...d, pages: d.pages.map((p) => ({ ...p, id: p.id || nouvelId(), elements: (p.elements || []).map((e) => ({ ...e, id: e.id || nouvelId() })) })) });

/**
 * Éditeur de design intégré (gratuit, Konva) : le client retouche ou dessine lui-même ses visuels.
 * - mode « carrousel » : chaque slide de l'aperçu est décomposée en calques (décor du modèle en
 *   fond + textes et images modifiables). Enregistrer = export 1080×1350 de chaque page.
 * - mode « visuel » : une page au format de l'image du post ; Enregistrer remplace le visuel.
 * - mode « modele » : un modèle enregistré (trois slides) ; Enregistrer met le modèle à jour.
 * - mode « creation » : nouveau modèle à partir d'un style (Carrousels) ; Enregistrer le crée.
 */
export default function EditeurCarrousel({ contenu, marque, apparence, mode = 'carrousel', modele, onClose, onSaved }) {
  const { t } = useTranslation();
  const estVisuel = mode === 'visuel';
  const estModele = mode === 'modele';
  const estCreation = mode === 'creation';
  const versModele = estModele || estCreation; // l'enregistrement produit un modèle
  const [design, setDesign] = useState(() => {
    if (estModele) return avecIds(modele.design);
    if (estVisuel) return null; // chargé selon le format de l'image (effet ci-dessous)
    if (contenu?.carrousel_design?.pages?.length) return contenu.carrousel_design;
    if (apparence?.slidesHtml?.length) return null; // décomposition en cours (effet ci-dessous)
    if (Array.isArray(contenu?.slides_images) && contenu.slides_images.length) return designDepuisSlides(contenu.slides_images);
    return designInitial(contenu?.carrousel_data, marque, apparence || {});
  });
  useEffect(() => {
    if (design) return;
    if (estVisuel) { designDepuisImage(contenu?.lien_visuel).then(setDesign); return; }
    // Carrousel : chaque slide est décomposée (décor du modèle en fond + textes modifiables). Une
    // slide qui ne se décompose pas garde son image d'origine.
    const secours = designDepuisSlides(contenu?.slides_images || []);
    decomposerSlides(apparence.slidesHtml)
      .then((d) => setDesign({
        ...d,
        pages: d.pages.map((p, i) => (p.fondImage ? p : (secours.pages[i] || p))),
      }))
      .catch(() => setDesign(secours.pages.length ? secours : designInitial(contenu?.carrousel_data, marque, apparence || {})));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const designPret = Boolean(design);
  const W = design?.w || LARGEUR;
  const H = design?.h || HAUTEUR;
  const [pageIdx, setPageIdx] = useState(0);
  const [selIds, setSelIds] = useState([]);
  const [echelle, setEchelle] = useState(0.4);
  const [enregistrement, setEnregistrement] = useState(null); // « 2/6 » pendant l'export
  const [policesPretes, setPolicesPretes] = useState(false);
  const [modeleOuvert, setModeleOuvert] = useState(false); // « Enregistrer comme modèle »
  const [guides, setGuides] = useState({ v: [], h: [] });  // lignes d'alignement pendant un déplacement
  const [menuFormes, setMenuFormes] = useState(false);
  const [miniLarge, setMiniLarge] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const zoneRef = useRef(null);
  const trRef = useRef(null);
  const noeuds = useRef({});
  const fichierImage = useRef(null);
  const fichierFond = useRef(null);
  const pressePapier = useRef([]);

  const page = design ? design.pages[Math.min(pageIdx, design.pages.length - 1)] : null;
  const selection = useMemo(() => (page ? page.elements.filter((e) => selIds.includes(e.id)) : []), [page, selIds]);
  const sel = selection.length === 1 ? selection[0] : null;

  useEffect(() => {
    if (design && !policesPretes) chargerPolices(design).then(() => setPolicesPretes(true));
  }, [design]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const maj = () => setMiniLarge(mq.matches);
    mq.addEventListener('change', maj);
    return () => mq.removeEventListener('change', maj);
  }, []);

  // ---------------------------------------------------------------- annuler / rétablir
  const histo = useRef({ passe: [], futur: [], dernier: null, quand: 0, ignorer: false });
  const [etatHisto, setEtatHisto] = useState({ annuler: false, retablir: false });
  useEffect(() => {
    if (!design) return;
    const h = histo.current;
    if (h.ignorer) { h.ignorer = false; h.dernier = design; return; }
    if (h.dernier && h.dernier !== design) {
      const maintenant = Date.now();
      if (maintenant - h.quand > PAS_HISTORIQUE) {
        h.passe.push(h.dernier);
        if (h.passe.length > 100) h.passe.shift();
      }
      h.futur = [];
      h.quand = maintenant;
    }
    h.dernier = design;
    setEtatHisto({ annuler: h.passe.length > 0, retablir: h.futur.length > 0 });
  }, [design]);
  const annuler = useCallback(() => {
    const h = histo.current;
    if (!h.passe.length) return;
    h.futur.push(h.dernier);
    h.ignorer = true;
    h.quand = 0;
    setDesign(h.passe.pop());
    setSelIds([]);
    setEtatHisto({ annuler: h.passe.length > 0, retablir: true });
  }, []);
  const retablir = useCallback(() => {
    const h = histo.current;
    if (!h.futur.length) return;
    h.passe.push(h.dernier);
    h.ignorer = true;
    h.quand = 0;
    setDesign(h.futur.pop());
    setSelIds([]);
    setEtatHisto({ annuler: true, retablir: h.futur.length > 0 });
  }, []);

  // La slide occupe toute la place disponible, sans jamais dépasser
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return undefined;
    const calc = () => {
      const r = el.getBoundingClientRect();
      setEchelle(Math.max(0.12, Math.min((r.width - 16) / W, (r.height - 16) / H)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, designPret]); // recalcul quand le design (et sa zone) apparaît

  // Cadre de sélection (déplacer, redimensionner, tourner) — un ou plusieurs éléments
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    tr.nodes(selIds.map((id) => noeuds.current[id]).filter(Boolean));
    tr.getLayer()?.batchDraw();
  }, [selIds, pageIdx, design]);

  const majPage = useCallback((fn) => setDesign((d) => ({
    ...d, pages: d.pages.map((p, i) => (i === pageIdx ? fn(p) : p)),
  })), [pageIdx]);
  const majElement = useCallback((id, champs) => majPage((p) => ({
    ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...champs } : e)),
  })), [majPage]);

  /** Clic sur un élément : Maj+clic l'ajoute ou le retire de la sélection. */
  const choisir = useCallback((id, evt) => {
    if (evt?.shiftKey) setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else setSelIds((s) => (s.includes(id) ? s : [id]));
  }, []);

  /** Après un déplacement à plusieurs, Konva a bougé tous les éléments sélectionnés : on relit
   * leur position pour l'enregistrer. */
  const finDeplacement = useCallback((id, noeud) => {
    setGuides({ v: [], h: [] });
    const ids = selIds.includes(id) ? selIds : [id];
    majPage((p) => ({
      ...p,
      elements: p.elements.map((e) => {
        if (!ids.includes(e.id)) return e;
        const n = e.id === id ? noeud : noeuds.current[e.id];
        return n ? { ...e, x: n.x(), y: n.y() } : e;
      }),
    }));
  }, [selIds, majPage]);

  /** Aimantation : bords et centre de la slide, bords et centres des autres éléments. */
  const aimanter = useCallback((id, noeud) => {
    if (selIds.length > 1) return; // à plusieurs, on déplace librement
    const seuil = SEUIL_AIMANT / echelle;
    const w = noeud.width() * noeud.scaleX();
    const h = noeud.height() * noeud.scaleY();
    const ciblesV = [0, W / 2, W];
    const ciblesH = [0, H / 2, H];
    page.elements.forEach((e) => {
      const n = noeuds.current[e.id];
      if (e.id === id || !n) return;
      const ew = n.width() * n.scaleX();
      const eh = n.height() * n.scaleY();
      ciblesV.push(n.x(), n.x() + ew / 2, n.x() + ew);
      ciblesH.push(n.y(), n.y() + eh / 2, n.y() + eh);
    });
    const caler = (pos, taille, cibles) => {
      let meilleur = null;
      [0, taille / 2, taille].forEach((d) => cibles.forEach((c) => {
        const ecart = Math.abs(pos + d - c);
        if (ecart < seuil && (!meilleur || ecart < meilleur.ecart)) meilleur = { ecart, pos: c - d, ligne: c };
      }));
      return meilleur;
    };
    const mv = caler(noeud.x(), w, ciblesV);
    const mh = caler(noeud.y(), h, ciblesH);
    if (mv) noeud.x(mv.pos);
    if (mh) noeud.y(mh.pos);
    setGuides({ v: mv ? [mv.ligne] : [], h: mh ? [mh.ligne] : [] });
  }, [selIds, echelle, W, H, page]);

  // Ordre des calques = ordre des éléments (le dernier est dessiné par-dessus les autres).
  const deplacerCalque = useCallback((sens) => {
    if (!sel) return;
    majPage((p) => {
      const els = [...p.elements];
      const i = els.findIndex((e) => e.id === sel.id);
      if (i < 0) return p;
      const [el] = els.splice(i, 1);
      const cible = { premier: els.length, avant: Math.min(els.length, i + 1), arriere: Math.max(0, i - 1), dernier: 0 }[sens];
      els.splice(cible, 0, el);
      return { ...p, elements: els };
    });
  }, [sel, majPage]);
  const rangSel = page && sel ? page.elements.findIndex((e) => e.id === sel.id) : -1;

  const supprimerSelection = useCallback(() => {
    if (!selIds.length) return;
    majPage((p) => ({ ...p, elements: p.elements.filter((e) => !selIds.includes(e.id)) }));
    setSelIds([]);
  }, [selIds, majPage]);

  const copier = useCallback(() => {
    if (selection.length) pressePapier.current = selection.map((e) => ({ ...e }));
  }, [selection]);
  const coller = useCallback(() => {
    if (!pressePapier.current.length) return;
    const copies = pressePapier.current.map((e) => ({ ...e, id: nouvelId(), x: e.x + 30, y: e.y + 30 }));
    pressePapier.current = copies.map((e) => ({ ...e })); // un 2e collage se décale encore
    majPage((p) => ({ ...p, elements: [...p.elements, ...copies] }));
    setSelIds(copies.map((e) => e.id));
  }, [majPage]);
  const dupliquer = useCallback(() => { copier(); coller(); }, [copier, coller]);

  const decaler = useCallback((dx, dy) => {
    majPage((p) => ({ ...p, elements: p.elements.map((e) => (selIds.includes(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e)) }));
  }, [selIds, majPage]);

  useEffect(() => {
    const clavier = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag)) return;
      const mod = e.ctrlKey || e.metaKey;
      const touche = e.key.toLowerCase();
      if (mod && touche === 'z' && !e.shiftKey) { e.preventDefault(); annuler(); return; }
      if (mod && (touche === 'y' || (touche === 'z' && e.shiftKey))) { e.preventDefault(); retablir(); return; }
      if (mod && touche === 'c') { copier(); return; }
      if (mod && touche === 'v') { e.preventDefault(); coller(); return; }
      if (mod && touche === 'd') { e.preventDefault(); dupliquer(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.length) { e.preventDefault(); supprimerSelection(); return; }
      if (e.key === 'Escape') { setSelIds([]); return; }
      const fleches = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (fleches[e.key] && selIds.length) {
        e.preventDefault();
        const pas = e.shiftKey ? 20 : 2;
        decaler(fleches[e.key][0] * pas, fleches[e.key][1] * pas);
      }
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [selIds, supprimerSelection, annuler, retablir, copier, coller, dupliquer, decaler]);

  const ajouterTexte = () => {
    const el = { id: nouvelId(), type: 'texte', text: t('editeurCarrousel.nouveauTexte'), x: 90, y: Math.round(H * 0.44), width: W - 180,
      fontSize: 56, fontFamily: 'Sora', fill: texteSur(page.fond), gras: true, align: 'left' };
    majPage((p) => ({ ...p, elements: [...p.elements, el] }));
    setSelIds([el.id]);
  };
  const ajouterForme = (forme) => {
    const couleur = apparence?.a || marque?.couleur_accent || '#3AFFA3';
    const el = nouvelleForme(forme, W, H, couleur, texteSur(page.fond));
    majPage((p) => ({ ...p, elements: [...p.elements, el] }));
    setSelIds([el.id]);
    setMenuFormes(false);
  };
  const ajouterImage = async (fichier) => {
    if (!fichier) return;
    try {
      const { src, width, height } = await lireImageLocale(fichier);
      const r = Math.min(1, 600 / Math.max(width, height));
      const el = { id: nouvelId(), type: 'image', src, x: (W - width * r) / 2, y: (H - height * r) / 2, width: width * r, height: height * r };
      majPage((p) => ({ ...p, elements: [...p.elements, el] }));
      setSelIds([el.id]);
    } catch (e) { toast.error(t('editeurCarrousel.imageIllisible')); }
  };
  const ajouterLogo = () => {
    if (!marque?.logo_url) return;
    const el = { id: nouvelId(), type: 'image', src: marque.logo_url, x: 90, y: H - 210, width: 120, height: 120 };
    majPage((p) => ({ ...p, elements: [...p.elements, el] }));
    setSelIds([el.id]);
  };
  const changerFondImage = async (fichier) => {
    if (!fichier) return;
    try {
      const { src } = await lireImageLocale(fichier, 1350);
      majPage((p) => ({ ...p, fondImage: src }));
    } catch (e) { toast.error(t('editeurCarrousel.imageIllisible')); }
  };

  const texteModifiable = () => {
    if (page?.origine === undefined) return;
    const base = designInitial(contenu?.carrousel_data, marque, apparence || {}).pages[page.origine];
    if (!base) return;
    majPage((p) => ({ ...base, id: p.id, elements: [...base.elements, ...p.elements] }));
    setSelIds([]);
  };

  const ajouterPage = () => {
    const nouvelle = { id: nouvelId(), fond: page?.fond || marque?.couleur_principale || '#003D2E', fondImage: null, elements: [] };
    setDesign((d) => ({ ...d, pages: [...d.pages.slice(0, pageIdx + 1), nouvelle, ...d.pages.slice(pageIdx + 1)] }));
    setPageIdx(pageIdx + 1); setSelIds([]);
  };
  const dupliquerPage = () => {
    const copie = { ...page, id: nouvelId(), elements: page.elements.map((e) => ({ ...e, id: nouvelId() })) };
    setDesign((d) => ({ ...d, pages: [...d.pages.slice(0, pageIdx + 1), copie, ...d.pages.slice(pageIdx + 1)] }));
    setPageIdx(pageIdx + 1); setSelIds([]);
  };
  const supprimerPage = () => {
    if (design.pages.length <= 1) return;
    setDesign((d) => ({ ...d, pages: d.pages.filter((_, i) => i !== pageIdx) }));
    setPageIdx(Math.max(0, pageIdx - 1)); setSelIds([]);
  };
  const deplacerPage = (sens) => {
    const cible = pageIdx + sens;
    if (cible < 0 || cible >= design.pages.length) return;
    setDesign((d) => {
      const pages = [...d.pages];
      [pages[pageIdx], pages[cible]] = [pages[cible], pages[pageIdx]];
      return { ...d, pages };
    });
    setPageIdx(cible);
  };

  const enregistrer = async () => {
    if (design.pages.length > 10) { toast.error(t('editeurCarrousel.tropDePages')); return; }
    setSelIds([]);
    try {
      await chargerPolices(design);
      if (estVisuel) {
        setEnregistrement(t('editeurCarrousel.envoi'));
        const url = await exporterPage(design.pages[0], design);
        const blob = await (await fetch(url)).blob();
        const d = await contenuService.uploadImage(contenu.id, new File([blob], 'visuel.jpg', { type: 'image/jpeg' }));
        toast.success(t('editeurCarrousel.visuelEnregistre'));
        onSaved?.({ lien_visuel: d?.lien_visuel || d?.url || contenu.lien_visuel });
        onClose?.();
        return;
      }
      const images = [];
      for (let i = 0; i < design.pages.length; i += 1) {
        setEnregistrement(`${i + 1}/${design.pages.length}`);
        images.push(await exporterPage(design.pages[i], design)); // eslint-disable-line no-await-in-loop
      }
      setEnregistrement(t('editeurCarrousel.envoi'));
      const d = await contenuService.enregistrerDesign(contenu.id, design, images);
      toast.success(t('editeurCarrousel.enregistre'));
      onSaved?.({ slides_images: d.slides_images, lien_visuel: d.slides_images?.[0], carrousel_pdf: d.carrousel_pdf, carrousel_design: design });
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('editeurCarrousel.echec'), { duration: 7000 });
    } finally {
      setEnregistrement(null);
    }
  };

  // Poignées du cadre : texte et trait (ligne, flèche) en largeur seulement, forme dans tous les sens.
  const ancres = (e) => {
    if (e?.type === 'texte' || (e?.type === 'forme' && formeOuverte(e))) return ['middle-left', 'middle-right'];
    if (e?.type === 'forme') return ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    return ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  };
  const couleursMarque = [...new Set([apparence?.p || marque?.couleur_principale, apparence?.s || marque?.couleur_secondaire, apparence?.a || marque?.couleur_accent, '#ffffff', '#0f172a'].filter(Boolean))];
  const nbMots = sel?.type === 'texte' ? (sel.text.match(/\S+/g) || []).length : 0;

  if (!design) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-[#020617]" data-testid="editeur-carrousel">
        <div className="flex flex-col items-center gap-3 text-sm text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />{t('editeurCarrousel.preparation')}
        </div>
      </div>
    );
  }

  const outilsAjout = (
    <>
      <Button size="sm" variant="ghost" onClick={ajouterTexte} className="text-slate-300 hover:text-white"><Type className="mr-1.5 h-4 w-4" />{t('editeurCarrousel.texte')}</Button>
      <div className="relative">
        <Button size="sm" variant="ghost" onClick={() => setMenuFormes((v) => !v)} aria-expanded={menuFormes}
          className="text-slate-300 hover:text-white" data-testid="editeur-formes"><Shapes className="mr-1.5 h-4 w-4" />{t('editeurCarrousel.forme')}</Button>
        {menuFormes && (
          <div className="absolute left-0 top-full z-[75] mt-1 grid w-56 grid-cols-3 gap-1 rounded-xl border border-white/10 bg-[#0f172a] p-2 shadow-2xl">
            {ICONES_FORMES.map(([forme, Icone]) => (
              <button key={forme} type="button" onClick={() => ajouterForme(forme)} data-testid={`editeur-forme-${forme}`}
                className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] text-slate-300 hover:bg-white/[0.06] hover:text-white">
                <Icone className="h-5 w-5" />{t(`editeurCarrousel.formes.${forme}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={() => fichierImage.current?.click()} className="text-slate-300 hover:text-white"><ImagePlus className="mr-1.5 h-4 w-4" />{t('editeurCarrousel.image')}</Button>
      {marque?.logo_url && <Button size="sm" variant="ghost" onClick={ajouterLogo} className="text-slate-300 hover:text-white">{t('editeurCarrousel.logo')}</Button>}
    </>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#020617] text-slate-100 font-inter" data-testid="editeur-carrousel">
      {/* Barre du haut */}
      <div className="flex items-center gap-1 border-b border-white/[0.08] px-3 py-2.5 sm:gap-2 sm:px-4">
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label={t('editeurCarrousel.fermer')}>
          <X className="h-5 w-5" />
        </button>
        <p className="mr-auto truncate font-sora text-sm font-semibold">
          {estModele ? modele.label : t(estCreation ? 'modeleCarrousel.nouveau' : (estVisuel ? 'editeurCarrousel.titreVisuel' : 'editeurCarrousel.titre'))}
        </p>
        <Button size="sm" variant="ghost" onClick={annuler} disabled={!etatHisto.annuler} className="px-2 text-slate-300"
          title={t('editeurCarrousel.annuler')} aria-label={t('editeurCarrousel.annuler')} data-testid="editeur-annuler"><Undo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" onClick={retablir} disabled={!etatHisto.retablir} className="px-2 text-slate-300"
          title={t('editeurCarrousel.retablir')} aria-label={t('editeurCarrousel.retablir')} data-testid="editeur-retablir"><Redo2 className="h-4 w-4" /></Button>
        <div className="hidden items-center gap-1 sm:flex">{outilsAjout}</div>
        {!estVisuel && !versModele && (
          <Button size="sm" variant="ghost" onClick={() => setModeleOuvert(true)} disabled={!pagesDuModele(design) || !!enregistrement}
            title={pagesDuModele(design) ? t('modeleCarrousel.ouvrir') : t('modeleCarrousel.troisSlides')}
            className="text-[#a5b0ff] hover:text-white" data-testid="editeur-enregistrer-modele">
            <LayoutTemplate className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">{t('modeleCarrousel.ouvrir')}</span>
          </Button>
        )}
        <Button size="sm" onClick={versModele ? () => setModeleOuvert(true) : enregistrer} disabled={!!enregistrement || (versModele && !pagesDuModele(design))}
          data-testid="editeur-enregistrer" className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white">
          {enregistrement ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{enregistrement}</> : <><Save className="mr-1.5 h-4 w-4" />{t(estModele ? 'modeleCarrousel.enregistrerModele' : (estCreation ? 'modeleCarrousel.enregistrer' : 'editeurCarrousel.enregistrer'))}</>}
        </Button>
      </div>
      <input ref={fichierImage} type="file" accept="image/*" hidden onChange={(e) => { ajouterImage(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={fichierFond} type="file" accept="image/*" hidden onChange={(e) => { changerFondImage(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Pages (carrousel et modèle) : miniatures du vrai rendu */}
        {!estVisuel && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/[0.08] p-2 md:w-36 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          {design.pages.map((p, i) => (
            <button key={p.id} type="button" onClick={() => { setPageIdx(i); setSelIds([]); }}
              className={`relative w-16 shrink-0 overflow-hidden rounded-md border text-left md:w-full ${i === pageIdx ? 'border-[#8A6CFF] ring-1 ring-[#8A6CFF]' : 'border-white/10'}`}
              aria-label={t('editeurCarrousel.slideN', { n: i + 1 })} data-testid={`editeur-page-${i + 1}`}>
              {policesPretes ? <MiniPage page={p} W={W} H={H} largeur={miniLarge ? 118 : 64} /> : <div className="aspect-[4/5] bg-slate-900" />}
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px]">{i + 1}</span>
              {versModele && (i === 0 || i === 1 || i === design.pages.length - 1) && <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 text-center text-[9px]">{t(`modeleCarrousel.page.${i === 0 ? 'couverture' : (i === 1 ? 'etape' : 'final')}`)}</span>}
            </button>
          ))}
          <button type="button" onClick={ajouterPage} disabled={design.pages.length >= 10}
            className="grid aspect-[4/5] w-16 shrink-0 place-items-center rounded-md border border-dashed border-white/15 text-slate-400 hover:text-white disabled:opacity-40 md:w-full"
            aria-label={t('editeurCarrousel.ajouterSlide')}>
            <Plus className="h-5 w-5" />
          </button>
        </div>
        )}

        {/* Slide en cours */}
        <div ref={zoneRef} className="relative grid min-h-[300px] flex-1 place-items-center overflow-hidden bg-[#0b1224] p-2"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelIds([]); }}>
          {policesPretes && page && (
            <Stage width={W * echelle} height={H * echelle} scaleX={echelle} scaleY={echelle}
              onMouseDown={(e) => { if (e.target === e.target.getStage() || e.target.name() === 'fond') setSelIds([]); }}
              onTouchStart={(e) => { if (e.target === e.target.getStage() || e.target.name() === 'fond') setSelIds([]); }}
              className="shadow-2xl">
              <Layer>
                <Rect name="fond" x={0} y={0} width={W} height={H} fill={page.fond || '#ffffff'} {...degradeKonva(page.degrade, W, H)} />
                {page.fondImage && <FondImage src={page.fondImage} w={W} h={H} />}
                {page.elements.map((el) => (
                  <Element key={el.id} el={el} refNode={(n) => { noeuds.current[el.id] = n; }}
                    onMouseDown={(e) => choisir(el.id, e.evt)} onTap={(e) => choisir(el.id, e.evt)}
                    onDragMove={(e) => aimanter(el.id, e.target)}
                    onDragEnd={(e) => finDeplacement(el.id, e.target)}
                    onTransform={el.type === 'texte' ? (e) => {
                      const n = e.target;
                      n.setAttrs({ width: Math.max(80, n.width() * n.scaleX()), scaleX: 1, scaleY: 1 });
                    } : undefined}
                    onTransformEnd={(e) => {
                      const n = e.target;
                      if (el.type === 'texte') {
                        majElement(el.id, { x: n.x(), y: n.y(), width: n.width(), rotation: n.rotation() });
                      } else {
                        majElement(el.id, { x: n.x(), y: n.y(), rotation: n.rotation(), width: Math.max(20, n.width() * n.scaleX()), height: Math.max(20, n.height() * n.scaleY()) });
                        n.scaleX(1); n.scaleY(1);
                      }
                    }} />
                ))}
                {guides.v.map((x) => <Line key={`v${x}`} points={[x, 0, x, H]} stroke="#FF4DA6" strokeWidth={2 / echelle} dash={[10 / echelle, 8 / echelle]} listening={false} />)}
                {guides.h.map((y) => <Line key={`h${y}`} points={[0, y, W, y]} stroke="#FF4DA6" strokeWidth={2 / echelle} dash={[10 / echelle, 8 / echelle]} listening={false} />)}
                <Transformer ref={trRef} rotateEnabled anchorSize={14} borderStroke="#8A6CFF" anchorStroke="#8A6CFF"
                  keepRatio={sel?.type === 'image'}
                  enabledAnchors={ancres(sel)}
                  resizeEnabled={selection.length <= 1}
                  boundBoxFunc={(ancien, neuf) => (neuf.width < 40 ? ancien : neuf)} />
              </Layer>
            </Stage>
          )}
          {!policesPretes && <Loader2 className="h-6 w-6 animate-spin text-slate-500" />}
        </div>

        {/* Propriétés */}
        <div className="shrink-0 space-y-4 overflow-y-auto border-t border-white/[0.08] p-3 md:w-72 md:border-l md:border-t-0">
          <div className="flex flex-wrap gap-1 sm:hidden">{outilsAjout}</div>

          {selection.length > 1 && (
            <p className="text-xs text-slate-400" data-testid="editeur-multi">{t('editeurCarrousel.nSelectionnes', { n: selection.length })}</p>
          )}

          {sel?.type === 'texte' && (
            <section className="space-y-2.5" aria-label={t('editeurCarrousel.texte')}>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">{t('editeurCarrousel.texte')}</p>
              <Textarea id="editeur-texte" value={sel.text} rows={4} onChange={(e) => majElement(sel.id, { text: e.target.value })}
                className="border-white/10 bg-slate-950/60 text-slate-100" />
              <div className="flex items-center gap-2">
                <label htmlFor="editeur-taille" className="w-14 text-xs text-slate-400">{t('editeurCarrousel.taille')}</label>
                <input id="editeur-taille" type="range" min="18" max="180" value={sel.fontSize}
                  onChange={(e) => majElement(sel.id, { fontSize: Number(e.target.value) })} className="flex-1 accent-[#8A6CFF]" />
                <span className="w-9 text-right text-xs tabular-nums text-slate-400">{Math.round(sel.fontSize)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="editeur-couleur" className="w-14 text-xs text-slate-400">{t('editeurCarrousel.couleur')}</label>
                <input id="editeur-couleur" type="color" value={sel.fill} onChange={(e) => majElement(sel.id, { fill: e.target.value })}
                  className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
                {couleursMarque.map((c) => (
                  <button key={c} type="button" onClick={() => majElement(sel.id, { fill: c })} aria-label={c}
                    className="h-6 w-6 rounded-full border border-white/20" style={{ background: c }} />
                ))}
              </div>
              {/* Mots en couleur : les derniers mots du texte prennent une autre couleur */}
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="editeur-accent" className="w-14 text-xs leading-tight text-slate-400">{t('editeurCarrousel.motsCouleur')}</label>
                <select id="editeur-accent" value={sel.accentMots || 0} data-testid="editeur-accent-mots"
                  onChange={(e) => majElement(sel.id, { accentMots: Number(e.target.value), accentCouleur: sel.accentCouleur || apparence?.a || marque?.couleur_accent || '#3AFFA3' })}
                  className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-xs">
                  {[0, 1, 2, 3, 4, 5].filter((n) => n <= Math.max(nbMots, sel.accentMots || 0)).map((n) => (
                    <option key={n} value={n}>{n === 0 ? t('editeurCarrousel.aucunMot') : t('editeurCarrousel.derniersMots', { count: n })}</option>
                  ))}
                </select>
                {(sel.accentMots || 0) > 0 && (
                  <input type="color" value={sel.accentCouleur || '#3AFFA3'} onChange={(e) => majElement(sel.id, { accentCouleur: e.target.value })}
                    aria-label={t('editeurCarrousel.couleurMots')} className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent" />
                )}
              </div>
              <select id="editeur-police" value={sel.fontFamily} aria-label={t('editeurCarrousel.police')}
                onChange={async (e) => { const f = e.target.value; await chargerPolices({ pages: [{ elements: [{ type: 'texte', fontFamily: f }] }] }); majElement(sel.id, { fontFamily: f }); }}
                className="w-full rounded-md border border-white/10 bg-slate-950/60 px-2 py-1.5 text-sm">
                {[...new Set([sel.fontFamily, ...POLICES])].map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <div className="flex gap-1">
                <button type="button" onClick={() => majElement(sel.id, { gras: !sel.gras })} aria-pressed={sel.gras}
                  className={`grid h-8 w-9 place-items-center rounded-md border ${sel.gras ? 'border-[#8A6CFF] bg-[#8A6CFF]/20' : 'border-white/10'}`} aria-label={t('editeurCarrousel.gras')}><Bold className="h-4 w-4" /></button>
                {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icone]) => (
                  <button key={a} type="button" onClick={() => majElement(sel.id, { align: a })} aria-pressed={sel.align === a}
                    className={`grid h-8 w-9 place-items-center rounded-md border ${sel.align === a ? 'border-[#8A6CFF] bg-[#8A6CFF]/20' : 'border-white/10'}`} aria-label={a}><Icone className="h-4 w-4" /></button>
                ))}
              </div>
            </section>
          )}
          {sel?.type === 'forme' && (
            <section className="space-y-2.5" aria-label={t('editeurCarrousel.forme')}>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">{t(`editeurCarrousel.formes.${sel.forme}`)}</p>
              {!formeOuverte(sel) && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="editeur-remplissage" className="w-16 text-xs text-slate-400">{t('editeurCarrousel.remplissage')}</label>
                  <input id="editeur-remplissage" type="color" value={sel.fill || '#ffffff'} onChange={(e) => majElement(sel.id, { fill: e.target.value })}
                    className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent" data-testid="editeur-forme-remplissage" />
                  {couleursMarque.map((c) => (
                    <button key={c} type="button" onClick={() => majElement(sel.id, { fill: c })} aria-label={c}
                      className="h-6 w-6 rounded-full border border-white/20" style={{ background: c }} />
                  ))}
                  <button type="button" onClick={() => majElement(sel.id, { fill: null, stroke: sel.stroke || texteSur(page.fond), strokeWidth: sel.strokeWidth || 6 })}
                    aria-pressed={!sel.fill} className={`rounded-md border px-2 py-1 text-[11px] ${!sel.fill ? 'border-[#8A6CFF] bg-[#8A6CFF]/20' : 'border-white/10 text-slate-400'}`}>
                    {t('editeurCarrousel.sansRemplissage')}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="editeur-contour" className="w-16 text-xs text-slate-400">{t(formeOuverte(sel) ? 'editeurCarrousel.couleur' : 'editeurCarrousel.contour')}</label>
                <input id="editeur-contour" type="color" value={sel.stroke || '#ffffff'}
                  onChange={(e) => majElement(sel.id, { stroke: e.target.value, strokeWidth: sel.strokeWidth || 6 })}
                  className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
                {couleursMarque.map((c) => (
                  <button key={c} type="button" onClick={() => majElement(sel.id, { stroke: c, strokeWidth: sel.strokeWidth || 6 })} aria-label={c}
                    className="h-6 w-6 rounded-full border border-white/20" style={{ background: c }} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="editeur-epaisseur" className="w-16 text-xs text-slate-400">{t('editeurCarrousel.epaisseur')}</label>
                <input id="editeur-epaisseur" type="range" min={formeOuverte(sel) ? 1 : 0} max="40" value={sel.strokeWidth || 0}
                  onChange={(e) => majElement(sel.id, { strokeWidth: Number(e.target.value), stroke: sel.stroke || texteSur(page.fond) })}
                  className="flex-1 accent-[#8A6CFF]" />
                <span className="w-8 text-right text-xs tabular-nums text-slate-400">{sel.strokeWidth || 0}</span>
              </div>
              {sel.forme === 'rect' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="editeur-arrondi" className="w-16 text-xs text-slate-400">{t('editeurCarrousel.arrondi')}</label>
                  <input id="editeur-arrondi" type="range" min="0" max={Math.round(Math.min(sel.width, sel.height) / 2)} value={sel.rayon || 0}
                    onChange={(e) => majElement(sel.id, { rayon: Number(e.target.value) })} className="flex-1 accent-[#8A6CFF]" />
                  <span className="w-8 text-right text-xs tabular-nums text-slate-400">{Math.round(sel.rayon || 0)}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label htmlFor="editeur-opacite" className="w-16 text-xs text-slate-400">{t('editeurCarrousel.opacite')}</label>
                <input id="editeur-opacite" type="range" min="10" max="100" value={Math.round((sel.opacity ?? 1) * 100)}
                  onChange={(e) => majElement(sel.id, { opacity: Number(e.target.value) / 100 })} className="flex-1 accent-[#8A6CFF]" />
                <span className="w-8 text-right text-xs tabular-nums text-slate-400">{Math.round((sel.opacity ?? 1) * 100)}</span>
              </div>
            </section>
          )}
          {sel && (
            <section className="space-y-2" aria-label={t('editeurCarrousel.disposition')}>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">{t('editeurCarrousel.disposition')}</p>
              <div className="grid grid-cols-4 gap-1">
                {[
                  ['premier', BringToFront, rangSel >= page.elements.length - 1],
                  ['avant', ArrowUp, rangSel >= page.elements.length - 1],
                  ['arriere', ArrowDown, rangSel <= 0],
                  ['dernier', SendToBack, rangSel <= 0],
                ].map(([sens, Icone, bloque]) => (
                  <Button key={sens} size="sm" variant="ghost" onClick={() => deplacerCalque(sens)} disabled={bloque}
                    title={t(`editeurCarrousel.calque.${sens}`)} aria-label={t(`editeurCarrousel.calque.${sens}`)}
                    className="text-slate-300 hover:text-white" data-testid={`editeur-calque-${sens}`}>
                    <Icone className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            </section>
          )}
          {selection.length > 0 && (
            <div className="space-y-1">
              <Button size="sm" variant="ghost" onClick={dupliquer} className="w-full justify-start text-slate-300" data-testid="editeur-dupliquer-element">
                <CopyPlus className="mr-2 h-4 w-4" />{t('editeurCarrousel.dupliquerElement')}
              </Button>
              <Button size="sm" variant="ghost" onClick={supprimerSelection} className="w-full justify-start text-rose-300 hover:text-rose-200">
                <Trash2 className="mr-2 h-4 w-4" />{t('editeurCarrousel.supprimerElement')}
              </Button>
            </div>
          )}

          <section className="space-y-2.5">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{t('editeurCarrousel.slideN', { n: pageIdx + 1 })}</p>
            <div className="flex items-center gap-2">
              <label htmlFor="editeur-fond" className="w-14 text-xs text-slate-400">{t('editeurCarrousel.fond')}</label>
              <input id="editeur-fond" type="color" value={/^#[0-9a-f]{6}$/i.test(page?.fond || '') ? page.fond : '#ffffff'} onChange={(e) => majPage((p) => ({ ...p, fond: e.target.value, degrade: null }))}
                className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
              {couleursMarque.slice(0, 4).map((c) => (
                <button key={c} type="button" onClick={() => majPage((p) => ({ ...p, fond: c, degrade: null }))} aria-label={c}
                  className="h-6 w-6 rounded-full border border-white/20" style={{ background: c }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => fichierFond.current?.click()} className="text-slate-300"><ImageIcon className="mr-1.5 h-4 w-4" />{t('editeurCarrousel.imageFond')}</Button>
              {page?.fondImage && <Button size="sm" variant="ghost" onClick={() => majPage((p) => ({ ...p, fondImage: null }))} className="text-slate-400">{t('editeurCarrousel.retirerFond')}</Button>}
            </div>
            {!estVisuel && page?.origine !== undefined && contenu?.carrousel_data && (
              <div className="space-y-1">
                <Button size="sm" variant="ghost" onClick={texteModifiable} className="text-[#a5b0ff]" data-testid="editeur-texte-modifiable">
                  <Type className="mr-1.5 h-4 w-4" />{t('editeurCarrousel.texteModifiable')}
                </Button>
                <p className="text-[11px] leading-snug text-slate-500">{t('editeurCarrousel.texteModifiableAide')}</p>
              </div>
            )}
            {!estVisuel && (
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => deplacerPage(-1)} disabled={pageIdx === 0} aria-label={t('editeurCarrousel.avant')}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => deplacerPage(1)} disabled={pageIdx >= design.pages.length - 1} aria-label={t('editeurCarrousel.apres')}><ChevronRight className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={dupliquerPage} disabled={design.pages.length >= 10} className="text-slate-300"><Copy className="mr-1.5 h-4 w-4" />{t('editeurCarrousel.dupliquer')}</Button>
              <Button size="sm" variant="ghost" onClick={supprimerPage} disabled={design.pages.length <= 1} className="text-rose-300"><Trash2 className="mr-1.5 h-4 w-4" />{t('editeurCarrousel.supprimerSlide')}</Button>
            </div>
            )}
          </section>
          <p className="text-[11px] leading-relaxed text-slate-500">{t('editeurCarrousel.aide')}</p>
          <p className="hidden text-[11px] leading-relaxed text-slate-500 md:block">{t('editeurCarrousel.raccourcis')}</p>
        </div>
      </div>
      {modeleOuvert && (
        <DialogueModeleCarrousel pages={pagesDuModele(design)} marque={marque} apparence={apparence}
          modele={estModele ? modele : null}
          onClose={() => setModeleOuvert(false)}
          onCree={(m) => { if (versModele) { onSaved?.(m); onClose?.(); } }} />
      )}
    </div>
  );
}
