import { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Lock, Unlock, Type, Captions, Image as ImageIcon, Film, Music } from 'lucide-react';
import { fmtTemps, arrondi, aimants, aimanter, dureeProjet } from './outils';

/**
 * Timeline multipiste : règle, tête de lecture, un rang par piste, éléments déplaçables et
 * rognables par leurs bords, aimantation aux bords voisins et à la tête de lecture.
 * Pendant un glisser, les changements passent sans historique ; `onFiger` au relâchement
 * n'écrit qu'une entrée d'annulation.
 */
const H_PISTE = 54;
const H_REGLE = 28;
const L_ETIQUETTES = 132;
const TOLERANCE_PX = 8;

const ICONES = { texte: Type, soustitres: Captions, image: ImageIcon, video: Film, audio: Music };
const COULEURS = {
  texte: 'from-[#8A6CFF]/70 to-[#5B6CFF]/70 border-[#8A6CFF]/60',
  soustitre: 'from-[#f59e0b]/60 to-[#f97316]/60 border-[#f59e0b]/60',
  image: 'from-[#0ea5e9]/60 to-[#2563eb]/60 border-[#38bdf8]/60',
  video: 'from-[#14b8a6]/60 to-[#0d9488]/60 border-[#2dd4bf]/60',
  audio: 'from-[#3AFFA3]/50 to-[#10b981]/50 border-[#3AFFA3]/60',
};

export default function Timeline({ projet, tete, onTete, selection, selectionIds = [], onSelection, onBasculerSelection, onChange, onFiger, onDeposer, onZoom, zoom, t }) {
  const zone = useRef(null);
  const [glisser, setGlisser] = useState(null); // {mode, id, x0, orig}
  const aBouge = useRef(false);                 // un simple clic (sans glisser) referme une sélection multiple sur l'élément cliqué
  const duree = dureeProjet(projet);
  const largeur = Math.max((duree + 6) * zoom, 800);

  const pas = zoom >= 120 ? 0.5 : zoom >= 60 ? 1 : zoom >= 25 ? 2 : 5;
  const graduations = useMemo(() => {
    const out = [];
    for (let s = 0; s <= (duree + 6); s += pas) out.push(arrondi(s, 0.001));
    return out;
  }, [duree, pas]);

  const xVers = (x) => Math.max(0, (x - L_ETIQUETTES + (zone.current?.scrollLeft || 0)) / zoom);

  const scrub = (e) => {
    const r = zone.current.getBoundingClientRect();
    onTete(arrondi(xVers(e.clientX - r.left), 1 / (projet.fps || 30)));
  };

  // ---- glisser : déplacer / rogner ----
  const commencer = (e, el, mode) => {
    const piste = projet.pistes.find((p) => p.id === el.piste);
    if (piste?.verrou) return;
    e.stopPropagation(); e.preventDefault();
    // Maj / Ctrl + clic : ajoute ou retire l'élément de la sélection, sans glisser.
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && mode === 'deplacer' && onBasculerSelection) { onBasculerSelection(el.id); return; }
    const dansSelection = selectionIds.includes(el.id);
    if (!dansSelection) onSelection(el.id);
    // Déplacer un élément de la sélection déplace tout le groupe du même écart.
    const groupe = mode === 'deplacer' && dansSelection ? selectionIds : [el.id];
    const origs = Object.fromEntries(projet.elements.filter((x) => groupe.includes(x.id)).map((x) => [x.id, x.debut]));
    aBouge.current = false;
    setGlisser({ mode, id: el.id, x0: e.clientX, orig: { ...el }, groupe, origs });
  };

  useEffect(() => {
    if (!glisser) return undefined;
    const tol = TOLERANCE_PX / zoom;
    const cibles = aimants(projet, glisser.id, tete);
    const bouger = (e) => {
      if (Math.abs(e.clientX - glisser.x0) > 3) aBouge.current = true;
      const dt = (e.clientX - glisser.x0) / zoom;
      const o = glisser.orig;
      // Écart du groupe : celui de l'élément saisi (aimanté), borné pour qu'aucun élément ne passe sous 0.
      let deltaGroupe = 0;
      if (glisser.mode === 'deplacer') {
        let debut = Math.max(0, o.debut + dt);
        const finAimantee = aimanter(debut + o.duree, cibles, tol);
        debut = aimanter(debut, cibles, tol);
        if (debut === Math.max(0, o.debut + dt)) debut = Math.max(0, finAimantee - o.duree);
        deltaGroupe = Math.max(-Math.min(...Object.values(glisser.origs)), debut - o.debut);
      }
      onChange((p) => ({
        ...p,
        elements: p.elements.map((x) => {
          if (glisser.mode === 'deplacer' && glisser.groupe.includes(x.id)) {
            return { ...x, debut: arrondi(glisser.origs[x.id] + deltaGroupe, 0.001) };
          }
          if (x.id !== glisser.id) return x;
          if (glisser.mode === 'gauche') {
            let debut = aimanter(o.debut + dt, cibles, tol);
            debut = Math.min(Math.max(0, debut), o.debut + o.duree - 0.1);
            const delta = debut - o.debut;
            const extra = {};
            if (x.type === 'video' || x.type === 'audio') {
              const dec = (o.decalage || 0) + delta * (o.vitesse || 1);
              if (dec < 0) { debut = o.debut - (o.decalage || 0) / (o.vitesse || 1); extra.decalage = 0; }
              else extra.decalage = arrondi(dec, 0.001);
            }
            return { ...x, ...extra, debut: arrondi(debut, 0.001), duree: arrondi(o.debut + o.duree - debut, 0.001) };
          }
          // droite
          let fin = aimanter(o.debut + o.duree + dt, cibles, tol);
          fin = Math.max(o.debut + 0.1, fin);
          return { ...x, duree: arrondi(fin - o.debut, 0.001) };
        }),
      }), { historique: false });
    };
    const lacher = () => {
      if (!aBouge.current && glisser.mode === 'deplacer' && glisser.groupe.length > 1) onSelection(glisser.id);
      setGlisser(null); onFiger();
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher, { once: true });
    return () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', lacher); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glisser, zoom]);

  // Ctrl + molette : zoom de la timeline (écouteur natif, la molette React est passive).
  useEffect(() => {
    const z = zone.current;
    if (!z || !onZoom) return undefined;
    const molette = (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); onZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
    z.addEventListener('wheel', molette, { passive: false });
    return () => z.removeEventListener('wheel', molette);
  }, [onZoom]);

  const basculer = (pisteId, champ) => onChange((p) => ({
    ...p, pistes: p.pistes.map((x) => (x.id === pisteId ? { ...x, [champ]: !x[champ] } : x)),
  }));

  const etiquette = (el) => {
    if (el.type === 'texte' || el.type === 'soustitre') return el.texte || '…';
    if (el.type === 'audio') return t('editeur.piste.audio');
    const nom = (el.src || '').split('/').pop().split('.')[0];
    return nom || el.type;
  };

  return (
    <div className="flex h-full bg-[#0a0f1c] border-t border-white/[0.08] select-none" data-testid="editeur-timeline">
      {/* Étiquettes des pistes */}
      <div className="shrink-0 border-r border-white/[0.08] overflow-hidden" style={{ width: L_ETIQUETTES }}>
        <div style={{ height: H_REGLE }} className="border-b border-white/[0.06] px-3 flex items-center text-[10.5px] uppercase tracking-wide text-slate-500 font-inter">
          {t('editeur.pistes')}
        </div>
        {projet.pistes.map((p) => {
          const Icone = ICONES[p.type] || Film;
          return (
            <div key={p.id} style={{ height: H_PISTE }} className="border-b border-white/[0.05] px-2.5 flex items-center gap-2 text-[12px] text-slate-300 font-inter">
              <Icone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate flex-1">{t(`editeur.piste.${p.type}`)}</span>
              {(p.type === 'video' || p.type === 'audio') && (
                <button type="button" onClick={() => basculer(p.id, 'muet')} title={t('editeur.muet')} data-testid={`piste-muet-${p.type}`}
                  className={`w-6 h-6 grid place-items-center rounded ${p.muet ? 'text-red-400 bg-red-500/10' : 'text-slate-500 hover:text-white'}`}>
                  {p.muet ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}
              <button type="button" onClick={() => basculer(p.id, 'verrou')} title={t('editeur.verrou')} data-testid={`piste-verrou-${p.type}`}
                className={`w-6 h-6 grid place-items-center rounded ${p.verrou ? 'text-[#3AFFA3] bg-[#3AFFA3]/10' : 'text-slate-600 hover:text-white'}`}>
                {p.verrou ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            </div>
          );
        })}
      </div>

      {/* Zone défilante : règle + pistes */}
      <div ref={zone} className="flex-1 overflow-x-auto overflow-y-auto relative" onPointerDown={(e) => { if (e.target === e.currentTarget) onSelection(null); }}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-postorico-media')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDrop={(e) => {
          const brut = e.dataTransfer.getData('application/x-postorico-media');
          if (!brut || !onDeposer) return;
          e.preventDefault();
          const r = zone.current.getBoundingClientRect();
          onDeposer(JSON.parse(brut), arrondi(xVers(e.clientX - r.left), 0.1));
        }}>
        <div style={{ width: largeur, position: 'relative' }}>
          {/* Règle */}
          <div style={{ height: H_REGLE }} className="relative border-b border-white/[0.06] cursor-pointer" onPointerDown={(e) => { scrub(e); const move = (ev) => scrub(ev); window.addEventListener('pointermove', move); window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), { once: true }); }} data-testid="editeur-regle">
            {graduations.map((s) => {
              const entier = Math.abs(s - Math.round(s)) < 1e-6;
              return (
                <div key={s} className="absolute bottom-0" style={{ left: s * zoom }}>
                  <div className={`w-px ${entier ? 'h-3 bg-slate-500' : 'h-1.5 bg-slate-700'}`} />
                  {entier && (s % (pas >= 2 ? pas : 1) === 0) && <span className="absolute -top-4 -translate-x-1/2 text-[10px] text-slate-500 font-mono">{fmtTemps(s).replace(/\.0$/, '')}</span>}
                </div>
              );
            })}
          </div>

          {/* Repère de couverture : l'instant choisi pour la miniature */}
          {projet.couverture != null && (
            <div className="absolute z-[5] pointer-events-none" style={{ left: projet.couverture * zoom, top: 2 }} data-testid="editeur-repere-couverture" title={t('editeur.couverture')}>
              <div className="-translate-x-1/2 px-1 py-0.5 rounded bg-[#8A6CFF] text-white text-[9px] font-bold leading-none">▣</div>
            </div>
          )}

          {/* Pistes */}
          {projet.pistes.map((p) => (
            <div key={p.id} style={{ height: H_PISTE }} className={`relative border-b border-white/[0.05] ${p.verrou ? 'opacity-60' : ''}`}
              onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelection(null); scrub(e); } }}>
              {projet.elements.filter((el) => el.piste === p.id).map((el) => {
                const sel = el.id === selection || selectionIds.includes(el.id);
                return (
                  <div key={el.id} data-testid={`element-${el.id}`}
                    onPointerDown={(e) => commencer(e, el, 'deplacer')}
                    className={`absolute top-1.5 bottom-1.5 rounded-md border bg-gradient-to-r ${COULEURS[el.type] || COULEURS.video} ${sel ? 'ring-2 ring-white shadow-[0_0_0_2px_rgba(58,255,163,.35)]' : 'hover:brightness-110'} cursor-grab active:cursor-grabbing overflow-hidden`}
                    style={{ left: el.debut * zoom, width: Math.max(6, el.duree * zoom) }}>
                    {el.transition?.type && el.transition.type !== 'aucune' && (
                      <div className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.35)_0_3px,transparent_3px_6px)] pointer-events-none" style={{ width: Math.max(4, (el.transition.duree || 0.5) * zoom) }} title={t(`editeur.transition.${el.transition.type}`)} />
                    )}
                    <div className="px-2 h-full flex items-center text-[11px] text-white/95 font-inter truncate">{etiquette(el)}</div>
                    {!p.verrou && (
                      <>
                        <div onPointerDown={(e) => commencer(e, el, 'gauche')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30" />
                        <div onPointerDown={(e) => commencer(e, el, 'droite')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 hover:bg-white/30" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Tête de lecture */}
          <div className="absolute top-0 bottom-0 w-px bg-[#3AFFA3] pointer-events-none z-10" style={{ left: tete * zoom }} data-testid="editeur-tete">
            <div className="absolute -top-0 -translate-x-1/2 w-3 h-3 rounded-sm bg-[#3AFFA3] rotate-45" />
          </div>
        </div>
      </div>
    </div>
  );
}

export { H_PISTE, H_REGLE };
