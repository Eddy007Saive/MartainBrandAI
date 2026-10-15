import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { Montage } from '../../generated/montage/Montage.jsx';
import { dureeEnFrames, elementsA } from '../../generated/montage/schema.js';

/** Zones masquées par l'interface de chaque réseau, en % d'une vidéo verticale 9:16
 * (approximatives : elles varient selon l'appareil et la longueur de la légende). Idée reprise
 * d'OpenCut (licence MIT) : le client voit où ses textes risquent d'être cachés. */
export const ZONES_RESEAUX = {
  tiktok: [{ x: 0, y: 0, w: 100, h: 8 }, { x: 0, y: 80, w: 100, h: 20 }, { x: 87, y: 40, w: 13, h: 40 }],
  reels: [{ x: 0, y: 0, w: 100, h: 11 }, { x: 0, y: 78, w: 100, h: 22 }, { x: 87, y: 46, w: 13, h: 32 }],
  shorts: [{ x: 0, y: 0, w: 100, h: 10 }, { x: 0, y: 76, w: 100, h: 24 }, { x: 86, y: 44, w: 14, h: 32 }],
};

// Aimantation au centre et aux bords du cadre (en % du canevas), désactivée en tenant Alt.
const TOLERANCE_AIMANT = 1.5;
function aimanterCadre(c) {
  const guides = [];
  const caler = (pos, taille, axe) => {
    const centre = pos + taille / 2;
    if (Math.abs(centre - 50) < TOLERANCE_AIMANT) { guides.push(`${axe}50`); return 50 - taille / 2; }
    if (Math.abs(pos) < TOLERANCE_AIMANT) { guides.push(`${axe}0`); return 0; }
    if (Math.abs(pos + taille - 100) < TOLERANCE_AIMANT) { guides.push(`${axe}100`); return 100 - taille; }
    return pos;
  };
  return { cadre: { ...c, x: caler(c.x, c.w, 'v'), y: caler(c.y, c.h, 'h') }, guides };
}

/**
 * Aperçu temps réel (@remotion/player, même composition que le rendu) + calque de
 * manipulation : l'élément sélectionné se déplace à la souris et se redimensionne par
 * ses coins ; les positions sont en % du canevas, donc indépendantes du format.
 */
export default function Apercu({ projet, tete, onTete, lecture, onLecture, selection, onSelection, onChange, onFiger, zones = 'aucune', t }) {
  const conteneur = useRef(null);
  const player = useRef(null);
  const [taille, setTaille] = useState({ w: 270, h: 480 });
  const [glisser, setGlisser] = useState(null);
  const [guides, setGuides] = useState([]); // lignes d'aimantation affichées pendant un déplacement
  const fps = projet.fps || 30;
  // En pause, chaque élément est montré dans son état posé ; la lecture rejoue les animations.
  const entree = useMemo(() => ({ ...projet, __statique: !lecture }), [projet, lecture]);
  const ratio = projet.largeur / projet.hauteur;

  // Ajuste l'aperçu à l'espace disponible en gardant le ratio du projet.
  useLayoutEffect(() => {
    const el = conteneur.current; if (!el) return undefined;
    const mesurer = () => {
      const r = el.getBoundingClientRect();
      const marge = 24;
      let h = r.height - marge, w = h * ratio;
      if (w > r.width - marge) { w = r.width - marge; h = w / ratio; }
      setTaille({ w: Math.max(120, w), h: Math.max(120, h) });
    };
    mesurer();
    const ro = new ResizeObserver(mesurer); ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);

  // Tête de lecture : le lecteur informe la page ; la page repositionne le lecteur.
  useEffect(() => {
    const p = player.current; if (!p) return undefined;
    const maj = (e) => onTete(e.detail.frame / fps);
    const fin = () => onLecture(false);
    p.addEventListener('frameupdate', maj); p.addEventListener('ended', fin); p.addEventListener('pause', fin);
    return () => { p.removeEventListener('frameupdate', maj); p.removeEventListener('ended', fin); p.removeEventListener('pause', fin); };
  }, [fps, onTete, onLecture]);

  useEffect(() => {
    const p = player.current; if (!p) return;
    const frame = Math.round(tete * fps);
    if (!p.isPlaying() && Math.abs(p.getCurrentFrame() - frame) >= 1) p.seekTo(frame);
  }, [tete, fps]);

  useEffect(() => {
    const p = player.current; if (!p) return;
    if (lecture && !p.isPlaying()) p.play();
    if (!lecture && p.isPlaying()) p.pause();
  }, [lecture]);

  // ---- calque de manipulation ----
  const visibles = elementsA(projet, tete).filter((e) => e.cadre && e.type !== 'soustitre');
  const enPx = (c) => ({ left: (c.x / 100) * taille.w, top: (c.y / 100) * taille.h, width: (c.w / 100) * taille.w, height: (c.h / 100) * taille.h });

  const commencer = (e, el, mode) => {
    e.stopPropagation(); e.preventDefault();
    onSelection(el.id);
    setGlisser({ mode, id: el.id, x0: e.clientX, y0: e.clientY, orig: { ...el.cadre } });
  };

  useEffect(() => {
    if (!glisser) return undefined;
    const bouger = (e) => {
      const dx = ((e.clientX - glisser.x0) / taille.w) * 100;
      const dy = ((e.clientY - glisser.y0) / taille.h) * 100;
      const o = glisser.orig;
      let c;
      let g = [];
      if (glisser.mode === 'deplacer') {
        c = { ...o, x: o.x + dx, y: o.y + dy };
        if (!e.altKey) ({ cadre: c, guides: g } = aimanterCadre(c));
      }
      else if (glisser.mode === 'se') c = { ...o, w: Math.max(4, o.w + dx), h: Math.max(3, o.h + dy) };
      else if (glisser.mode === 'ne') c = { ...o, y: o.y + dy, w: Math.max(4, o.w + dx), h: Math.max(3, o.h - dy) };
      else if (glisser.mode === 'sw') c = { ...o, x: o.x + dx, w: Math.max(4, o.w - dx), h: Math.max(3, o.h + dy) };
      else c = { ...o, x: o.x + dx, y: o.y + dy, w: Math.max(4, o.w - dx), h: Math.max(3, o.h - dy) };
      const arr = (v) => Math.round(v * 10) / 10;
      c = { x: arr(c.x), y: arr(c.y), w: arr(c.w), h: arr(c.h) };
      setGuides(g);
      onChange((p) => ({ ...p, elements: p.elements.map((x) => (x.id === glisser.id ? { ...x, cadre: c } : x)) }), { historique: false });
    };
    const lacher = () => { setGlisser(null); setGuides([]); onFiger(); };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher, { once: true });
    return () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', lacher); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glisser, taille]);

  const poignee = (el, mode, pos) => (
    <div key={mode} onPointerDown={(e) => commencer(e, el, mode)}
      className="absolute w-3 h-3 rounded-sm bg-white border border-[#5B6CFF] shadow" style={{ ...pos, cursor: `${mode}-resize` }} />
  );

  return (
    <div ref={conteneur} className="flex-1 min-h-0 grid place-items-center bg-[#05091a] relative" data-testid="editeur-apercu"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onSelection(null); }}>
      <div className="relative rounded-xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,.6)] ring-1 ring-white/10" style={{ width: taille.w, height: taille.h }}>
        <Player
          ref={player}
          component={Montage}
          inputProps={entree}
          durationInFrames={dureeEnFrames(projet)}
          fps={fps}
          compositionWidth={projet.largeur}
          compositionHeight={projet.hauteur}
          style={{ width: taille.w, height: taille.h }}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          spaceKeyToPlayOrPause={false}
          acknowledgeRemotionLicense
        />
        {/* Zones masquées par l'interface du réseau choisi (formats verticaux seulement) */}
        {ZONES_RESEAUX[zones] && projet.hauteur > projet.largeur && (
          <div className="absolute inset-0 pointer-events-none z-[1]" data-testid="editeur-zones-securite">
            {ZONES_RESEAUX[zones].map((z, i) => (
              <div key={i} className="absolute bg-[repeating-linear-gradient(135deg,rgba(248,113,113,.28)_0_6px,rgba(248,113,113,.1)_6px_12px)] border border-red-400/40"
                style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }} />
            ))}
            <span className="absolute left-1.5 bottom-1 text-[9px] font-inter font-semibold text-red-200/90 bg-black/40 px-1 rounded">{t?.('editeur.zones.masque')}</span>
          </div>
        )}
        {/* Lignes d'aimantation (centre, bords) */}
        {guides.map((g) => (
          <div key={g} className="absolute pointer-events-none z-[2] bg-[#ff3fa4]"
            style={g[0] === 'v' ? { left: `${g.slice(1)}%`, top: 0, bottom: 0, width: 1 } : { top: `${g.slice(1)}%`, left: 0, right: 0, height: 1 }} />
        ))}
        {/* Calque : zones cliquables des éléments visibles, poignées sur la sélection */}
        <div className="absolute inset-0" onPointerDown={(e) => { if (e.target === e.currentTarget) onSelection(null); }}>
          {visibles.map((el) => {
            const sel = el.id === selection;
            const px = enPx(el.cadre);
            return (
              <div key={el.id} onPointerDown={(e) => commencer(e, el, 'deplacer')}
                className={`absolute ${sel ? 'border-2 border-[#3AFFA3]' : 'border border-transparent hover:border-white/40'} cursor-move`}
                style={{ ...px, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }} data-testid={`apercu-element-${el.id}`}>
                {sel && (
                  <>
                    {poignee(el, 'nw', { left: -6, top: -6 })}
                    {poignee(el, 'ne', { right: -6, top: -6 })}
                    {poignee(el, 'sw', { left: -6, bottom: -6 })}
                    {poignee(el, 'se', { right: -6, bottom: -6 })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
