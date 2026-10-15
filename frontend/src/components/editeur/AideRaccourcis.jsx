import { X } from 'lucide-react';

/**
 * Fenêtre d'aide des raccourcis clavier de l'éditeur (touche « ? » ou bouton clavier).
 * Idée reprise d'OpenCut (licence MIT) : les raccourcis existaient, personne ne les connaissait.
 * La liste suit le gestionnaire `onKey` de EditeurVideo : à tenir à jour ensemble.
 */
// Touches dont le nom change selon la langue du clavier affiché (Espace / Space / Espacio…).
const TOUCHES_TRADUITES = { espace: 1, suppr: 1, maj: 1, debut: 1, fin: 1, echap: 1, ctrl: 1 };

const RACCOURCIS = [
  ['lecture', ['espace']],
  ['couper', ['S']],
  ['rognerGauche', ['Q']],
  ['rognerDroite', ['W']],
  ['dupliquer', ['D']],
  ['supprimer', ['suppr']],
  ['copier', ['ctrl', 'C']],
  ['couperPresse', ['ctrl', 'X']],
  ['coller', ['ctrl', 'V']],
  ['tout', ['ctrl', 'A']],
  ['annuler', ['ctrl', 'Z']],
  ['retablir', ['ctrl', 'Y']],
  ['image', ['←', '→']],
  ['seconde', ['maj', '← / →']],
  ['debutFin', ['debut', 'fin']],
  ['zoom', ['+', '−']],
  ['aimant', ['N']],
  ['libre', ['Alt']],
  ['deselectionner', ['echap']],
  ['aide', ['?']],
];

export default function AideRaccourcis({ onClose, t }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="w-[460px] max-w-full max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0f172a] p-6"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="aide-raccourcis-titre" data-testid="editeur-aide-raccourcis">
        <div className="flex items-center justify-between mb-4">
          <h2 id="aide-raccourcis-titre" className="text-[17px] font-sora font-bold text-white">{t('editeur.raccourcis.titre')}</h2>
          <button type="button" onClick={onClose} aria-label={t('editeur.raccourcis.fermer')} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {RACCOURCIS.map(([cle, touches]) => (
            <li key={cle} className="flex items-center justify-between gap-4 py-2">
              <span className="text-[13px] text-slate-300 font-inter">{t(`editeur.raccourcis.${cle}`)}</span>
              <span className="flex items-center gap-1 shrink-0">
                {touches.map((k) => (
                  <kbd key={k} className="min-w-[26px] text-center px-1.5 py-0.5 rounded-md border border-white/15 bg-white/[0.04] text-[11.5px] font-mono text-slate-200">
                    {TOUCHES_TRADUITES[k] ? t(`editeur.raccourcis.touche.${k}`) : k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
