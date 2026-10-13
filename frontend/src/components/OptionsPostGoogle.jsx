import { useTranslation } from 'react-i18next';

const TYPES = ['STANDARD', 'EVENT', 'OFFER'];
const BOUTONS = ['', 'LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP', 'CALL'];

const champ = 'w-full bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-2 text-[13px] text-slate-200 font-inter outline-none focus:border-[#5B6CFF]/50';
const etiquette = 'text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1 block';

/** Options d'un post de fiche Google : type (nouveauté, événement, offre), dates, offre, bouton d'action.
 * valeur = contenu.google_options ({ type, evenement, offre, bouton }). */
export default function OptionsPostGoogle({ valeur, onChange }) {
  const { t } = useTranslation();
  const o = valeur || {};
  const type = o.type || 'STANDARD';
  const maj = (cle, v) => onChange({ ...o, [cle]: v });
  const majDans = (cle, sous, v) => onChange({ ...o, [cle]: { ...(o[cle] || {}), [sous]: v } });
  const bouton = o.bouton?.type || '';

  return (
    <div className="rounded-xl border border-[#4285F4]/25 bg-[#4285F4]/[0.05] p-3.5 space-y-3" data-testid="options-post-google">
      <p className="text-[13px] text-white font-sora font-semibold">{t('contenus.google.titre')}</p>
      <div className="flex gap-2 flex-wrap">
        {TYPES.map((ty) => (
          <button key={ty} type="button" onClick={() => maj('type', ty)}
            className={`px-3 py-1.5 rounded-lg text-[12.5px] font-inter border transition-colors ${type === ty ? 'border-[#4285F4] bg-[#4285F4]/15 text-white' : 'border-slate-800 text-slate-400 hover:text-white'}`}>
            {t(`contenus.google.type.${ty}`)}
          </button>
        ))}
      </div>

      {(type === 'EVENT' || type === 'OFFER') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2">
            <span className={etiquette}>{type === 'EVENT' ? t('contenus.google.titreEvenement') : t('contenus.google.titreOffre')}</span>
            <input className={champ} maxLength={58} value={o.evenement?.titre || ''} onChange={(e) => majDans('evenement', 'titre', e.target.value)} />
          </label>
          <label>
            <span className={etiquette}>{t('contenus.google.debut')}</span>
            <input type="datetime-local" className={champ} value={o.evenement?.debut || ''} onChange={(e) => majDans('evenement', 'debut', e.target.value)} />
          </label>
          <label>
            <span className={etiquette}>{t('contenus.google.fin')}</span>
            <input type="datetime-local" className={champ} value={o.evenement?.fin || ''} onChange={(e) => majDans('evenement', 'fin', e.target.value)} />
          </label>
        </div>
      )}

      {type === 'OFFER' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className={etiquette}>{t('contenus.google.code')}</span>
            <input className={champ} maxLength={58} value={o.offre?.code || ''} onChange={(e) => majDans('offre', 'code', e.target.value)} />
          </label>
          <label>
            <span className={etiquette}>{t('contenus.google.lienOffre')}</span>
            <input className={champ} placeholder="https://" value={o.offre?.lien || ''} onChange={(e) => majDans('offre', 'lien', e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className={etiquette}>{t('contenus.google.conditions')}</span>
            <textarea rows={2} className={champ} value={o.offre?.conditions || ''} onChange={(e) => majDans('offre', 'conditions', e.target.value)} />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label>
          <span className={etiquette}>{t('contenus.google.bouton')}</span>
          <select className={champ} value={bouton} onChange={(e) => maj('bouton', e.target.value ? { ...(o.bouton || {}), type: e.target.value } : null)}>
            {BOUTONS.map((b) => <option key={b || 'aucun'} value={b}>{t(`contenus.google.boutons.${b || 'AUCUN'}`)}</option>)}
          </select>
        </label>
        {bouton && bouton !== 'CALL' && (
          <label>
            <span className={etiquette}>{t('contenus.google.lienBouton')}</span>
            <input className={champ} placeholder="https://" value={o.bouton?.url || ''} onChange={(e) => majDans('bouton', 'url', e.target.value)} />
          </label>
        )}
      </div>
      <p className="text-[11px] text-slate-500 font-inter">{t('contenus.google.aide')}</p>
    </div>
  );
}
