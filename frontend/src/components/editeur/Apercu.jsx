import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { Montage } from '../../generated/montage/Montage.jsx';
import { dureeEnFrames, elementsA } from '../../generated/montage/schema.js';

/**
 * Aperçu temps réel (@remotion/player, même composition que le rendu) + calque de
 * manipulation : l'élément sélectionné se déplace à la souris et se redimensionne par
 * ses coins ; les positions sont en % du canevas, donc indépendantes du format.
 */
export default function Apercu({ projet, tete, onTete, lecture, onLecture, selection, onSelection, onChange, onFiger }) {
  const conteneur = useRef(null);
  const player = useRef(null);
  const [taille, setTaille] = useState({ w: 270, h: 480 });
  const [glisser, setGlisser] = useState(null);
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
      if (glisser.mode === 'deplacer') c = { ...o, x: o.x + dx, y: o.y + dy };
      else if (glisser.mode === 'se') c = { ...o, w: Math.max(4, o.w + dx), h: Math.max(3, o.h + dy) };
      else if (glisser.mode === 'ne') c = { ...o, y: o.y + dy, w: Math.max(4, o.w + dx), h: Math.max(3, o.h - dy) };
      else if (glisser.mode === 'sw') c = { ...o, x: o.x + dx, w: Math.max(4, o.w - dx), h: Math.max(3, o.h + dy) };
      else c = { ...o, x: o.x + dx, y: o.y + dy, w: Math.max(4, o.w - dx), h: Math.max(3, o.h - dy) };
      const arr = (v) => Math.round(v * 10) / 10;
      c = { x: arr(c.x), y: arr(c.y), w: arr(c.w), h: arr(c.h) };
      onChange((p) => ({ ...p, elements: p.elements.map((x) => (x.id === glisser.id ? { ...x, cadre: c } : x)) }), { historique: false });
    };
    const lacher = () => { setGlisser(null); onFiger(); };
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
