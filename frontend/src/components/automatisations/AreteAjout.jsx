import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { BLOCS, PALETTE } from './catalogue';

/** Fourni par l'éditeur : insérer un bloc sur un lien, ou supprimer le lien. */
export const ContexteAretes = createContext({ inserer: () => {}, supprimer: () => {} });

/** Blocs insérables au milieu d'une chaîne : il leur faut une sortie pour relier la suite. */
const INSERABLES = PALETTE.filter((k) => !BLOCS[k].terminal);

/**
 * Lien entre deux blocs, avec un « + » en son milieu (façon n8n) : au survol sur ordinateur,
 * toujours visible sur écran tactile. Le « + » ouvre la liste des blocs ; le bloc choisi est
 * inséré entre les deux blocs reliés.
 */
function AreteAjout({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, selected }) {
  const { t } = useTranslation();
  const { inserer, supprimer } = useContext(ContexteAretes);
  const [survol, setSurvol] = useState(false);
  const [menu, setMenu] = useState(false);
  const refMenu = useRef(null);
  const [chemin, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  // Fermer le menu au clic à l'extérieur.
  useEffect(() => {
    if (!menu) return undefined;
    const fermer = (e) => { if (refMenu.current && !refMenu.current.contains(e.target)) setMenu(false); };
    document.addEventListener('pointerdown', fermer);
    return () => document.removeEventListener('pointerdown', fermer);
  }, [menu]);

  const visible = survol || selected || menu;
  return (
    <>
      <BaseEdge id={id} path={chemin} markerEnd={markerEnd} style={{ ...style, stroke: visible ? '#8A6CFF' : style?.stroke }} />
      {/* Zone de survol large et invisible le long du lien */}
      <path d={chemin} fill="none" stroke="transparent" strokeWidth={24} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)} />
      <EdgeLabelRenderer>
        <div
          ref={refMenu}
          className="absolute nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all', zIndex: menu ? 1000 : 1 }}
          onMouseEnter={() => setSurvol(true)}
          onMouseLeave={() => setSurvol(false)}
        >
          <div className={`flex items-center gap-1 transition-opacity ${visible ? 'opacity-100' : 'opacity-0 [@media(hover:none)]:opacity-100'}`}>
            <button type="button" onClick={() => setMenu((m) => !m)} data-testid={`arete-ajouter-${id}`}
              title={t('auto.insererBloc')} aria-label={t('auto.insererBloc')}
              className="w-6 h-6 grid place-items-center rounded-full bg-[#0f172a] border border-[#8A6CFF]/60 text-[#c4b5fd] hover:bg-[#8A6CFF] hover:text-white shadow-lg">
              <Plus className="w-3.5 h-3.5" />
            </button>
            {visible && !menu && (
              <button type="button" onClick={() => supprimer(id)} title={t('auto.supprimerLien')} aria-label={t('auto.supprimerLien')}
                className="w-6 h-6 grid place-items-center rounded-full bg-[#0f172a] border border-white/15 text-slate-400 hover:text-rose-400 hover:border-rose-400/50 shadow-lg">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
          {menu && (
            <div className="absolute left-1/2 -translate-x-1/2 top-8 w-52 rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl p-1.5" data-testid={`arete-menu-${id}`}>
              <p className="px-2 pt-1 pb-1.5 text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">{t('auto.insererBloc')}</p>
              {INSERABLES.map((k) => {
                const B = BLOCS[k];
                return (
                  <button key={k} type="button" onClick={() => { setMenu(false); inserer(id, k); }} data-testid={`arete-inserer-${k}`}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.06]">
                    <span className="w-5 h-5 rounded grid place-items-center shrink-0" style={{ background: `${B.color}22` }}><B.icon className="w-3 h-3" style={{ color: B.color }} /></span>
                    <span className="text-[12.5px] text-slate-200 truncate">{t(`auto.bloc.${k}`)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(AreteAjout);
