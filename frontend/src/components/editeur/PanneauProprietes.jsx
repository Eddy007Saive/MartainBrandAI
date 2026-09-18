import { ANIMATIONS, STYLE_SOUSTITRES_DEFAUT } from '../../generated/montage/schema.js';
import { fmtTemps } from './outils';

/**
 * Panneau de droite : les réglages de l'élément sélectionné, sinon ceux du projet
 * (format, fond, style des sous-titres). Chaque champ écrit directement dans le projet.
 */
const FORMATS = [
  { id: '9:16', l: 1080, h: 1920 },
  { id: '4:5', l: 1080, h: 1350 },
  { id: '1:1', l: 1080, h: 1080 },
  { id: '16:9', l: 1920, h: 1080 },
];
const POLICES = ['Sora', 'Inter', 'Georgia', 'Mono'];

const Champ = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10.5px] uppercase tracking-wide text-slate-500 font-inter mb-1">{label}</span>
    {children}
  </label>
);
const cls = 'w-full bg-slate-950/60 border border-white/10 text-slate-200 text-[12.5px] font-inter rounded-lg px-2.5 py-1.5 outline-none focus:border-[#5B6CFF]/60';
const Nombre = ({ valeur, onChange, min, max, pas = 0.1, suffixe }) => (
  <div className="relative">
    <input type="number" value={valeur ?? ''} min={min} max={max} step={pas} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} className={cls} />
    {suffixe && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">{suffixe}</span>}
  </div>
);
const Curseur = ({ valeur, onChange, min = 0, max = 1, pas = 0.01 }) => (
  <input type="range" min={min} max={max} step={pas} value={valeur ?? 0} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#3AFFA3]" />
);
const Couleur = ({ valeur, onChange }) => {
  const hex = /^#([0-9a-f]{6})$/i.test(valeur || '') ? valeur : '#ffffff';
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded border border-white/10 bg-transparent p-0" />
      <input type="text" value={valeur || ''} onChange={(e) => onChange(e.target.value)} className={cls} placeholder="transparent" />
    </div>
  );
};
const Bascule = ({ label, valeur, onChange }) => (
  <button type="button" onClick={() => onChange(!valeur)}
    className={`text-[11.5px] font-inter font-semibold px-2.5 py-1.5 rounded-lg border ${valeur ? 'border-[#3AFFA3] text-[#3AFFA3] bg-[#3AFFA3]/10' : 'border-white/10 text-slate-400 hover:text-white'}`}>{label}</button>
);

export default function PanneauProprietes({ projet, element, onElement, onProjet, onTranscrire, transcription, t }) {
  const majStyle = (k, v) => onElement((e) => ({ ...e, style: { ...(e.style || {}), [k]: v } }));
  const majCadre = (k, v) => onElement((e) => ({ ...e, cadre: { ...(e.cadre || { x: 0, y: 0, w: 100, h: 100 }), [k]: v } }));

  if (!element) {
    const stS = { ...STYLE_SOUSTITRES_DEFAUT, ...(projet.soustitres?.style || {}) };
    const majS = (k, v) => onProjet((p) => ({ ...p, soustitres: { ...(p.soustitres || {}), style: { ...(p.soustitres?.style || {}), [k]: v } } }));
    const format = FORMATS.find((f) => f.l === projet.largeur && f.h === projet.hauteur)?.id || '9:16';
    return (
      <div className="p-3.5 space-y-3.5" data-testid="editeur-proprietes-projet">
        <h3 className="text-[13px] font-sora font-semibold text-white">{t('editeur.prop.projet')}</h3>
        <Champ label={t('editeur.prop.format')}>
          <div className="grid grid-cols-4 gap-1">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" onClick={() => onProjet((p) => ({ ...p, largeur: f.l, hauteur: f.h }))}
                className={`text-[11.5px] font-mono py-1.5 rounded-lg border ${format === f.id ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-400 hover:text-white'}`}>{f.id}</button>
            ))}
          </div>
        </Champ>
        <Champ label={t('editeur.prop.fond')}><Couleur valeur={projet.fond} onChange={(v) => onProjet((p) => ({ ...p, fond: v }))} /></Champ>
        <div className="pt-2 border-t border-white/[0.06]">
          <h4 className="text-[12px] font-sora font-semibold text-slate-200 mb-2">{t('editeur.prop.soustitres')}</h4>
          <div className="space-y-2.5">
            <Champ label={t('editeur.prop.taille')}><Nombre valeur={stS.taille} onChange={(v) => majS('taille', v)} min={20} max={160} pas={2} suffixe="px" /></Champ>
            <Champ label={t('editeur.prop.couleur')}><Couleur valeur={stS.couleur} onChange={(v) => majS('couleur', v)} /></Champ>
            <Champ label={t('editeur.prop.fondTexte')}><Couleur valeur={stS.fond} onChange={(v) => majS('fond', v)} /></Champ>
            <Champ label={t('editeur.prop.position')}><Curseur valeur={stS.position} onChange={(v) => majS('position', v)} min={5} max={90} pas={1} /></Champ>
            <div className="flex gap-1.5"><Bascule label={t('editeur.prop.gras')} valeur={stS.gras} onChange={(v) => majS('gras', v)} /><Bascule label={t('editeur.prop.contour')} valeur={stS.contour} onChange={(v) => majS('contour', v)} /></div>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 font-inter leading-snug pt-2">{t('editeur.prop.aideSelection')}</p>
      </div>
    );
  }

  const e = element;
  const st = e.style || {};
  return (
    <div className="p-3.5 space-y-3" data-testid="editeur-proprietes-element">
      <h3 className="text-[13px] font-sora font-semibold text-white flex items-center justify-between">
        {t(`editeur.type.${e.type}`)}
        <span className="text-[11px] font-mono text-slate-500">{fmtTemps(e.debut)} → {fmtTemps(e.debut + e.duree)}</span>
      </h3>

      {(e.type === 'texte' || e.type === 'soustitre') && (
        <Champ label={t('editeur.prop.texte')}>
          <textarea value={e.texte || ''} rows={3} maxLength={600} onChange={(ev) => onElement({ texte: ev.target.value })} className={`${cls} resize-none`} data-testid="prop-texte" />
        </Champ>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Champ label={t('editeur.prop.debut')}><Nombre valeur={e.debut} onChange={(v) => onElement({ debut: Math.max(0, v) })} min={0} pas={0.1} suffixe="s" /></Champ>
        <Champ label={t('editeur.prop.duree')}><Nombre valeur={e.duree} onChange={(v) => onElement({ duree: Math.max(0.1, v) })} min={0.1} pas={0.1} suffixe="s" /></Champ>
      </div>

      {(e.type === 'video' || e.type === 'audio') && (
        <>
          <Champ label={`${t('editeur.prop.volume')} · ${Math.round((e.volume ?? 1) * 100)} %`}><Curseur valeur={e.volume ?? 1} onChange={(v) => onElement({ volume: v })} /></Champ>
          <Champ label={t('editeur.prop.decalage')}><Nombre valeur={e.decalage || 0} onChange={(v) => onElement({ decalage: Math.max(0, v) })} min={0} pas={0.1} suffixe="s" /></Champ>
        </>
      )}
      {e.type === 'video' && onTranscrire && (
        <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/[0.06] p-2.5">
          <button type="button" onClick={() => onTranscrire(e.id)} disabled={!!transcription} data-testid="prop-transcrire"
            className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg text-[12.5px] font-inter font-semibold text-[#fcd34d] border border-[#f59e0b]/50 hover:bg-[#f59e0b]/15 disabled:opacity-60">
            {transcription === e.id ? <span className="w-3.5 h-3.5 rounded-full border-2 border-[#fcd34d]/40 border-t-[#fcd34d] animate-spin" /> : null}
            {transcription === e.id ? t('editeur.prop.transcrireEnCours') : t('editeur.prop.transcrire')}
          </button>
          <p className="text-[11px] text-slate-500 font-inter leading-snug mt-1.5">{t('editeur.prop.transcrireAide')}</p>
        </div>
      )}
      {e.type === 'video' && (
        <Champ label={t('editeur.prop.vitesse')}>
          <div className="grid grid-cols-4 gap-1">
            {[0.5, 1, 1.5, 2].map((v) => (
              <button key={v} type="button" onClick={() => onElement({ vitesse: v })}
                className={`text-[11.5px] font-mono py-1.5 rounded-lg border ${(e.vitesse || 1) === v ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-400 hover:text-white'}`}>×{v}</button>
            ))}
          </div>
        </Champ>
      )}
      {e.type === 'audio' && (
        <Champ label={t('editeur.prop.fonduSortie')}><Nombre valeur={e.fonduSortie || 0} onChange={(v) => onElement({ fonduSortie: Math.max(0, v) })} min={0} max={10} pas={0.5} suffixe="s" /></Champ>
      )}

      {(e.type === 'video' || e.type === 'image') && (
        <>
          <Champ label={t('editeur.prop.ajustement')}>
            <div className="grid grid-cols-2 gap-1">
              {['cover', 'contain'].map((a) => (
                <button key={a} type="button" onClick={() => onElement({ ajustement: a })}
                  className={`text-[11.5px] font-inter py-1.5 rounded-lg border ${(e.ajustement || 'cover') === a ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-400 hover:text-white'}`}>{t(`editeur.prop.${a}`)}</button>
              ))}
            </div>
          </Champ>
          <Champ label={t('editeur.prop.arrondi')}><Curseur valeur={e.rayon || 0} onChange={(v) => onElement({ rayon: v })} min={0} max={200} pas={2} /></Champ>
        </>
      )}
      {e.type === 'image' && (
        <Champ label={t('editeur.prop.animation')}>
          <select value={e.animation || 'aucune'} onChange={(ev) => onElement({ animation: ev.target.value })} className={cls}>
            {['aucune', 'zoom', 'fondu', 'monter', 'pop'].map((a) => <option key={a} value={a}>{t(`editeur.anim.${a}`)}</option>)}
          </select>
        </Champ>
      )}

      {e.type === 'texte' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Champ label={t('editeur.prop.police')}>
              <select value={st.police || 'Sora'} onChange={(ev) => majStyle('police', ev.target.value)} className={cls}>
                {POLICES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Champ>
            <Champ label={t('editeur.prop.taille')}><Nombre valeur={st.taille || 64} onChange={(v) => majStyle('taille', v)} min={16} max={240} pas={2} suffixe="px" /></Champ>
          </div>
          <Champ label={t('editeur.prop.couleur')}><Couleur valeur={st.couleur} onChange={(v) => majStyle('couleur', v)} /></Champ>
          <Champ label={t('editeur.prop.fondTexte')}><Couleur valeur={st.fond} onChange={(v) => majStyle('fond', v)} /></Champ>
          <div className="flex flex-wrap gap-1.5">
            <Bascule label={t('editeur.prop.gras')} valeur={st.gras} onChange={(v) => majStyle('gras', v)} />
            <Bascule label={t('editeur.prop.italique')} valeur={st.italique} onChange={(v) => majStyle('italique', v)} />
            <Bascule label={t('editeur.prop.ombre')} valeur={st.ombre} onChange={(v) => majStyle('ombre', v)} />
            <Bascule label={t('editeur.prop.contour')} valeur={st.contour} onChange={(v) => majStyle('contour', v)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Champ label={t('editeur.prop.align')}>
              <div className="grid grid-cols-3 gap-1">
                {['left', 'center', 'right'].map((a) => (
                  <button key={a} type="button" onClick={() => majStyle('align', a)}
                    className={`text-[11px] py-1.5 rounded-lg border ${(st.align || 'center') === a ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-400'}`}>{a === 'left' ? '⇤' : a === 'right' ? '⇥' : '↔'}</button>
                ))}
              </div>
            </Champ>
            <Champ label={t('editeur.prop.animation')}>
              <select value={st.animation || 'aucune'} onChange={(ev) => majStyle('animation', ev.target.value)} className={cls}>
                {ANIMATIONS.map((a) => <option key={a} value={a}>{t(`editeur.anim.${a}`)}</option>)}
              </select>
            </Champ>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Champ label={t('editeur.prop.arrondi')}><Nombre valeur={st.rayon || 0} onChange={(v) => majStyle('rayon', v)} min={0} max={200} pas={2} /></Champ>
            <Champ label={t('editeur.prop.marge')}><Nombre valeur={st.marge || 0} onChange={(v) => majStyle('marge', v)} min={0} max={120} pas={2} /></Champ>
          </div>
        </>
      )}

      {e.cadre && (
        <div className="pt-2 border-t border-white/[0.06]">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-500 font-inter mb-1.5">{t('editeur.prop.cadre')}</div>
          <div className="grid grid-cols-4 gap-1.5">
            {['x', 'y', 'w', 'h'].map((k) => (
              <div key={k} className="relative">
                <input type="number" value={Math.round(e.cadre[k] * 10) / 10} step={1} onChange={(ev) => majCadre(k, Number(ev.target.value))} className={`${cls} pl-5`} />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 uppercase">{k}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Champ label={t('editeur.prop.rotation')}><Nombre valeur={e.rotation || 0} onChange={(v) => onElement({ rotation: v })} min={-180} max={180} pas={1} suffixe="°" /></Champ>
            <Champ label={`${t('editeur.prop.opacite')} · ${Math.round((e.opacite ?? 1) * 100)} %`}><Curseur valeur={e.opacite ?? 1} onChange={(v) => onElement({ opacite: v })} /></Champ>
          </div>
          <button type="button" onClick={() => onElement({ cadre: { x: 0, y: 0, w: 100, h: 100 }, rotation: 0 })}
            className="mt-2 text-[11.5px] text-slate-400 hover:text-white font-inter underline underline-offset-2">{t('editeur.prop.pleinEcran')}</button>
        </div>
      )}
    </div>
  );
}
