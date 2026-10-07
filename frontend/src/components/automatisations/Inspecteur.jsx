import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X, Info, Loader2, Check, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { workflowService } from '../../services/workflowService';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { BLOCS, OPERATEURS, SANS_VALEUR, VARIABLES, declencheursPour, rid } from './catalogue';

/* Panneau de réglages du bloc sélectionné. Chaque champ écrit directement dans la
   `config` Zernio du bloc (voir catalogue.js pour les formes). */

const champ = 'w-full h-9 rounded-lg bg-white/[0.04] border border-white/10 px-2.5 text-[13px] text-white focus:outline-none focus:border-[#8A6CFF]/60';

const Bloc = ({ titre, aide, children }) => (
  <div className="space-y-1.5">
    {titre && <Label className="text-[12px] text-slate-300">{titre}</Label>}
    {children}
    {aide && <p className="text-[11px] text-slate-500 leading-snug">{aide}</p>}
  </div>
);

const Choix = ({ value, onChange, options, testid }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className={champ} data-testid={testid}>
    {options.map(([v, l]) => <option key={v} value={v} className="bg-[#0f172a]">{l}</option>)}
  </select>
);

const listeMots = (txt) => txt.split(',').map((s) => s.trim()).filter(Boolean);

/** Durée saisie en minutes, heures ou jours, stockée en minutes (max Zernio : 30 jours). */
function Duree({ minutes, onChange, t }) {
  const m = Number(minutes) || 0;
  const unite = m && m % 1440 === 0 ? 1440 : m && m % 60 === 0 ? 60 : 1;
  return (
    <div className="flex gap-2">
      <Input type="number" min={1} value={m / unite || ''} className="h-9 bg-white/[0.04] border-white/10"
        onChange={(e) => onChange(Math.min(43200, Math.max(1, Math.round(Number(e.target.value) || 1) * unite)))} />
      <select value={unite} onChange={(e) => onChange(Math.min(43200, Math.max(1, Math.round((m / unite) || 1) * Number(e.target.value))))} className={`${champ} w-32`}>
        <option value={1} className="bg-[#0f172a]">{t('auto.unite.minutes')}</option>
        <option value={60} className="bg-[#0f172a]">{t('auto.unite.heures')}</option>
        <option value={1440} className="bg-[#0f172a]">{t('auto.unite.jours')}</option>
      </select>
    </div>
  );
}

function ChipsVariables({ onInsert, extras = [] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {[...VARIABLES.slice(0, 3), ...extras].map((v) => (
        <button key={v} type="button" onClick={() => onInsert(`{{${v}}}`)}
          className="text-[10.5px] px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white">{`{{${v}}}`}</button>
      ))}
    </div>
  );
}

/** Choix du post visé par un déclencheur « commentaire » : « Tous mes posts » ou un post
 * précis, choisi sur sa miniature (l'identifiant Instagram/Facebook reste invisible). */
function ChoixPost({ accountId, value, onChange, t, langue }) {
  const [posts, setPosts] = useState(null);
  useEffect(() => {
    let vivant = true;
    setPosts(null);
    if (!accountId) { setPosts([]); return undefined; }
    workflowService.posts(accountId).then((r) => vivant && setPosts(r.posts || [])).catch(() => vivant && setPosts([]));
    return () => { vivant = false; };
  }, [accountId]);
  const inconnu = value && posts && !posts.some((p) => p.platformPostId === value);
  const Case = ({ actif, onClick, children, testid }) => (
    <button type="button" onClick={onClick} data-testid={testid}
      className={`relative w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors ${actif ? 'border-[#8A6CFF] bg-[#8A6CFF]/10' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
      {children}
      {actif && <Check className="w-4 h-4 text-[#8A6CFF] shrink-0 ml-auto" />}
    </button>
  );
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] text-slate-300">{t('auto.champ.post')}</Label>
      <Case actif={!value} onClick={() => onChange(undefined)} testid="auto-post-tous">
        <span className="w-10 h-10 rounded-md grid place-items-center bg-white/[0.05] shrink-0"><ImageIcon className="w-4 h-4 text-slate-400" /></span>
        <span className="text-[12.5px] text-white">{t('auto.post.tous')}</span>
      </Case>
      {inconnu && (
        <Case actif onClick={() => onChange(undefined)}>
          <span className="w-10 h-10 rounded-md grid place-items-center bg-amber-500/10 shrink-0"><AlertTriangle className="w-4 h-4 text-amber-400" /></span>
          <span className="text-[11.5px] text-amber-200 leading-snug">{t('auto.post.inconnu', { id: value })}</span>
        </Case>
      )}
      {posts === null ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
      ) : posts.length === 0 ? (
        <p className="text-[11px] text-slate-500">{t('auto.post.aucun')}</p>
      ) : (
        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-0.5">
          {posts.map((p) => (
            <Case key={p.platformPostId} actif={value === p.platformPostId} onClick={() => onChange(p.platformPostId)} testid={`auto-post-${p.platformPostId}`}>
              {p.miniature
                ? <img src={p.miniature} alt="" loading="lazy" className="w-10 h-10 rounded-md object-cover shrink-0 bg-white/[0.05]" />
                : <span className="w-10 h-10 rounded-md grid place-items-center bg-white/[0.05] shrink-0"><ImageIcon className="w-4 h-4 text-slate-500" /></span>}
              <span className="min-w-0">
                <span className="block text-[12px] text-slate-200 line-clamp-2 leading-snug">{p.texte || t('auto.post.sansTexte')}</span>
                {p.publieLe && <span className="block text-[10.5px] text-slate-500 mt-0.5">{new Date(p.publieLe).toLocaleDateString(langue, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </span>
            </Case>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-500 leading-snug">{t('auto.aide.post')}</p>
    </div>
  );
}

function Declencheur({ c, set, platform, accountId, t, langue }) {
  const type = c.triggerType || 'inbound_message';
  const commentaire = type === 'comment';
  const mots = (commentaire ? c.comment?.keywords : c.keywords) || [];
  const match = (commentaire ? c.comment?.matchType : c.matchType) || 'contains';
  const majMots = (patch) => (commentaire ? set({ comment: { ...(c.comment || {}), ...patch } }) : set(patch));
  return (
    <>
      <Bloc titre={t('auto.champ.declencheur')}>
        <Choix value={type} testid="auto-declencheur"
          onChange={(v) => set(v === 'comment'
            ? { triggerType: v, comment: { keywords: mots, matchType: match }, keywords: undefined, matchType: undefined, onlyFirstMessage: undefined }
            : v === 'story_mention'
              ? { triggerType: v, comment: undefined, keywords: undefined, matchType: undefined, onlyFirstMessage: undefined }
              : { triggerType: v, comment: undefined, keywords: mots, matchType: match })}
          options={declencheursPour(platform).map((d) => [d, t(`auto.declencheur.${d}`)])} />
      </Bloc>
      {type !== 'story_mention' && (
        <>
          <Bloc titre={t('auto.champ.motsCles')} aide={t('auto.aide.motsCles')}>
            <Input defaultValue={mots.join(', ')} key={`${type}-mots`} className="h-9 bg-white/[0.04] border-white/10"
              placeholder="GUIDE, PRIX" onBlur={(e) => majMots({ keywords: listeMots(e.target.value) })} data-testid="auto-mots-cles" />
          </Bloc>
          <Bloc titre={t('auto.champ.correspondance')}>
            <Choix value={match} onChange={(v) => majMots({ matchType: v })}
              options={['contains', 'exact', 'any'].map((m) => [m, t(`auto.match.${m}`)])} />
          </Bloc>
        </>
      )}
      {commentaire && (
        <ChoixPost accountId={accountId} value={c.comment?.platformPostId} t={t} langue={langue}
          onChange={(id) => {
            const comment = { ...(c.comment || {}), platformPostId: id };
            if (!id) delete comment.platformPostId;
            set({ comment });
          }} />
      )}
      {type === 'inbound_message' && (
        <div className="flex items-center justify-between gap-3">
          <Label className="text-[12px] text-slate-300">{t('auto.champ.premierMessage')}</Label>
          <Switch checked={!!c.onlyFirstMessage} onCheckedChange={(v) => set({ onlyFirstMessage: v })} />
        </div>
      )}
      {type !== 'comment' && (
        <Bloc titre={t('auto.champ.cooldown')} aide={t('auto.aide.cooldown')}>
          <Input type="number" min={1} max={720} value={c.cooldownHours ?? ''} className="h-9 bg-white/[0.04] border-white/10"
            onChange={(e) => set({ cooldownHours: e.target.value ? Math.min(720, Math.max(1, Number(e.target.value))) : undefined })} />
        </Bloc>
      )}
    </>
  );
}

/** Déplace les liens des boutons à la fin du texte et retire boutons / réponses rapides. */
const lienDansTexte = (c) => {
  const liens = (c.buttons || []).map((b) => b.url).filter((u) => u && u !== 'https://');
  const texte = [c.text || '', ...liens.filter((u) => !(c.text || '').includes(u))].filter(Boolean).join(' ');
  return { text: texte, buttons: undefined, quickReplies: undefined };
};

function Message({ c, set, t, extras, apresCommentaire }) {
  const mode = c.buttons?.length ? 'boutons' : c.quickReplies?.length ? 'rapides' : 'aucun';
  // Réponse privée à un commentaire : Instagram n'affiche que le texte simple (une bulle
  // vide sinon). Les options boutons / réponses rapides n'y sont donc pas proposées.
  const optionsPermises = !apresCommentaire;
  const limite = mode === 'boutons' ? 640 : 2000;
  const texte = c.text || '';
  return (
    <>
      {apresCommentaire && (
        <p className="flex gap-2 text-[11.5px] text-amber-200/90 bg-amber-500/[0.08] border border-amber-500/20 rounded-lg p-2.5">
          <Info className="w-4 h-4 shrink-0 mt-px" />{t('auto.aide.reponsePrivee')}
        </p>
      )}
      {!apresCommentaire && (
        <Bloc titre={t('auto.champ.typeMessage')}>
          <Choix value={c.messageType || 'text'} onChange={(v) => set(v === 'media'
            ? { messageType: v, media: c.media || { mediaType: 'image', url: '' }, buttons: undefined, quickReplies: undefined }
            : { messageType: v, media: undefined })}
            options={[['text', t('auto.typeMessage.text')], ['media', t('auto.typeMessage.media')]]} />
        </Bloc>
      )}
      {c.messageType === 'media' ? (
        <>
          <Bloc titre={t('auto.champ.typeMedia')}>
            <Choix value={c.media?.mediaType || 'image'} onChange={(v) => set({ media: { ...(c.media || {}), mediaType: v } })}
              options={['image', 'video', 'audio', 'document'].map((m) => [m, t(`auto.media.${m}`)])} />
          </Bloc>
          <Bloc titre={t('auto.champ.urlMedia')}>
            <Input value={c.media?.url || ''} placeholder="https://" className="h-9 bg-white/[0.04] border-white/10"
              onChange={(e) => set({ media: { ...(c.media || {}), url: e.target.value } })} />
          </Bloc>
        </>
      ) : (
        <>
          <Bloc titre={t('auto.champ.texte')}>
            <Textarea rows={5} value={texte} maxLength={limite} className="bg-white/[0.04] border-white/10 text-[13px]"
              onChange={(e) => set({ text: e.target.value })} data-testid="auto-texte" />
            <div className="flex items-start justify-between gap-2">
              <ChipsVariables extras={extras} onInsert={(v) => set({ text: `${texte}${texte && !texte.endsWith(' ') ? ' ' : ''}${v}` })} />
              <span className="text-[10.5px] text-slate-500 shrink-0 tabular-nums">{texte.length}/{limite}</span>
            </div>
          </Bloc>
          {apresCommentaire && mode !== 'aucun' && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.08] p-2.5 space-y-2">
              <p className="text-[11.5px] text-rose-200 leading-snug">{t('auto.aide.boutonsCommentaire')}</p>
              <button type="button" onClick={() => set(lienDansTexte(c))} data-testid="auto-lien-dans-texte"
                className="w-full h-8 rounded-lg bg-rose-500/20 text-rose-100 text-[12px] font-semibold hover:bg-rose-500/30">{t('auto.lienDansTexte')}</button>
            </div>
          )}
          {optionsPermises && (
          <Bloc titre={t('auto.champ.options')}>
            <Choix value={mode} onChange={(v) => set({
              buttons: v === 'boutons' ? (c.buttons?.length ? c.buttons : [{ type: 'url', title: '', url: 'https://' }]) : undefined,
              quickReplies: v === 'rapides' ? (c.quickReplies?.length ? c.quickReplies : [{ title: '', payload: '' }]) : undefined,
            })}
              options={[['aucun', t('auto.options.aucun')], ['boutons', t('auto.options.boutons')], ['rapides', t('auto.options.rapides')]]} />
          </Bloc>
          )}
          {optionsPermises && mode === 'boutons' && (
            <div className="space-y-2">
              {c.buttons.map((b, i) => (
                <div key={i} className="rounded-lg border border-white/10 p-2 space-y-1.5">
                  <div className="flex gap-1.5">
                    <Input value={b.title} maxLength={20} placeholder={t('auto.champ.titreBouton')} className="h-8 bg-white/[0.04] border-white/10 text-[12.5px]"
                      onChange={(e) => set({ buttons: c.buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                    <button type="button" onClick={() => set({ buttons: c.buttons.filter((_, j) => j !== i).length ? c.buttons.filter((_, j) => j !== i) : undefined })}
                      className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:text-rose-400 shrink-0" aria-label={t('auto.supprimer')}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <Input value={b.url} placeholder="https://" className="h-8 bg-white/[0.04] border-white/10 text-[12.5px]"
                    onChange={(e) => set({ buttons: c.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                </div>
              ))}
              {c.buttons.length < 3 && (
                <button type="button" onClick={() => set({ buttons: [...c.buttons, { type: 'url', title: '', url: 'https://' }] })}
                  className="flex items-center gap-1 text-[12px] text-[#8A6CFF] hover:text-white"><Plus className="w-3.5 h-3.5" />{t('auto.ajouterBouton')}</button>
              )}
            </div>
          )}
          {optionsPermises && mode === 'rapides' && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500">{t('auto.aide.rapides')}</p>
              {c.quickReplies.map((q, i) => (
                <div key={i} className="flex gap-1.5">
                  <Input value={q.title} maxLength={20} placeholder={t('auto.champ.titreReponse')} className="h-8 bg-white/[0.04] border-white/10 text-[12.5px]"
                    onChange={(e) => set({ quickReplies: c.quickReplies.map((x, j) => (j === i ? { ...x, title: e.target.value, payload: x.payload || '' } : x)) })} />
                  <Input value={q.payload || ''} placeholder={t('auto.champ.valeur')} className="h-8 w-24 bg-white/[0.04] border-white/10 text-[12.5px]"
                    onChange={(e) => set({ quickReplies: c.quickReplies.map((x, j) => (j === i ? { ...x, payload: e.target.value } : x)) })} />
                  <button type="button" onClick={() => set({ quickReplies: c.quickReplies.filter((_, j) => j !== i).length ? c.quickReplies.filter((_, j) => j !== i) : undefined })}
                    className="w-8 h-8 grid place-items-center rounded-lg text-slate-500 hover:text-rose-400 shrink-0" aria-label={t('auto.supprimer')}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {c.quickReplies.length < 13 && (
                <button type="button" onClick={() => set({ quickReplies: [...c.quickReplies, { title: '', payload: '' }] })}
                  className="flex items-center gap-1 text-[12px] text-[#8A6CFF] hover:text-white"><Plus className="w-3.5 h-3.5" />{t('auto.ajouterReponse')}</button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function Condition({ c, set, t, extras }) {
  const rules = c.rules || [];
  const maj = (i, patch) => set({ rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const vars = [...new Set([...VARIABLES, ...extras])];
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-500">{t('auto.aide.condition')}</p>
      {rules.map((r, i) => (
        <div key={r.id} className="rounded-lg border border-white/10 p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold text-slate-300">{t('auto.sortie.regle', { n: i + 1 })}</span>
            {rules.length > 1 && (
              <button type="button" onClick={() => set({ rules: rules.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-rose-400" aria-label={t('auto.supprimer')}><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
          <Choix value={r.variable} onChange={(v) => maj(i, { variable: v })} options={vars.map((v) => [v, v])} />
          <Choix value={r.operator} onChange={(v) => maj(i, { operator: v, value: SANS_VALEUR.includes(v) ? undefined : r.value ?? '' })}
            options={OPERATEURS.map((o) => [o, t(`auto.operateur.${o}`)])} />
          {!SANS_VALEUR.includes(r.operator) && (
            <Input value={r.value ?? ''} placeholder={t('auto.champ.valeur')} className="h-8 bg-white/[0.04] border-white/10 text-[12.5px]"
              onChange={(e) => maj(i, { value: e.target.value })} />
          )}
        </div>
      ))}
      <button type="button" onClick={() => set({ rules: [...rules, { id: rid('r'), variable: 'lastMessage', operator: 'contains', value: '' }] })}
        className="flex items-center gap-1 text-[12px] text-[#8A6CFF] hover:text-white"><Plus className="w-3.5 h-3.5" />{t('auto.ajouterRegle')}</button>
    </div>
  );
}

export default function Inspecteur({ noeud, platform, accountId, extras, apresCommentaire, onConfig, onLabel, onSupprimer, onFermer }) {
  const { t, i18n } = useTranslation();
  if (!noeud) return null;
  const { kind, config: c = {}, label } = noeud.data;
  const def = BLOCS[kind];
  const Icone = def.icon;
  const set = (patch) => {
    const suivant = { ...c, ...patch };
    Object.keys(suivant).forEach((k) => suivant[k] === undefined && delete suivant[k]);
    onConfig(suivant);
  };
  return (
    <div className="flex flex-col h-full" data-testid="auto-inspecteur">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0" style={{ background: `${def.color}22` }}><Icone className="w-4 h-4" style={{ color: def.color }} /></span>
        <span className="flex-1 text-[14px] font-semibold text-white font-sora truncate">{t(`auto.bloc.${kind}`)}</span>
        <button type="button" onClick={onFermer} className="w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-white" aria-label={t('auto.fermer')}><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-[12px] text-slate-400 leading-snug">{t(`auto.description.${kind}`)}</p>
        <Bloc titre={t('auto.champ.nomBloc')}>
          <Input value={label || ''} maxLength={80} placeholder={t(`auto.bloc.${kind}`)} className="h-9 bg-white/[0.04] border-white/10"
            onChange={(e) => onLabel(e.target.value)} />
        </Bloc>
        {kind === 'trigger' && <Declencheur c={c} set={set} platform={platform} accountId={accountId} t={t} langue={i18n.language} />}
        {kind === 'send_message' && <Message c={c} set={set} t={t} extras={extras} apresCommentaire={apresCommentaire} />}
        {kind === 'wait_for_reply' && (
          <>
            <Bloc titre={t('auto.champ.attendre')} aide={t('auto.aide.attente')}>
              <Duree minutes={c.timeoutMinutes} onChange={(v) => set({ timeoutMinutes: v })} t={t} />
            </Bloc>
            <Bloc titre={t('auto.champ.saveAs')} aide={t('auto.aide.saveAs')}>
              <Input value={c.saveAs || ''} className="h-9 bg-white/[0.04] border-white/10"
                onChange={(e) => set({ saveAs: e.target.value.replace(/[^A-Za-z0-9_]/g, '') || undefined })} />
            </Bloc>
          </>
        )}
        {kind === 'condition' && <Condition c={c} set={set} t={t} extras={extras} />}
        {kind === 'delay' && (
          <Bloc titre={t('auto.champ.patienter')}>
            <Duree minutes={c.delayMinutes} onChange={(v) => set({ delayMinutes: v })} t={t} />
          </Bloc>
        )}
        {kind === 'a_b_split' && (
          <Bloc titre={t('auto.champ.pourcentage')} aide={t('auto.aide.ab')}>
            <Input type="number" min={1} max={99} value={c.percentage ?? 50} className="h-9 bg-white/[0.04] border-white/10"
              onChange={(e) => set({ percentage: Math.min(99, Math.max(1, Number(e.target.value) || 50)) })} />
          </Bloc>
        )}
        {(kind === 'add_tag' || kind === 'remove_tag') && (
          <Bloc titre={t('auto.champ.tag')} aide={t('auto.aide.tag')}>
            <Input value={c.tag || ''} className="h-9 bg-white/[0.04] border-white/10" onChange={(e) => set({ tag: e.target.value })} />
          </Bloc>
        )}
        {kind === 'set_field' && (
          <>
            <Bloc titre={t('auto.champ.champ')}>
              <Input value={c.field || ''} className="h-9 bg-white/[0.04] border-white/10" onChange={(e) => set({ field: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} />
            </Bloc>
            <Bloc titre={t('auto.champ.valeur')}>
              <Input value={c.value || ''} className="h-9 bg-white/[0.04] border-white/10" onChange={(e) => set({ value: e.target.value })} />
            </Bloc>
          </>
        )}
        {kind === 'handoff' && (
          <Bloc titre={t('auto.champ.note')} aide={t('auto.aide.handoff')}>
            <Textarea rows={3} value={c.note || ''} className="bg-white/[0.04] border-white/10 text-[13px]" onChange={(e) => set({ note: e.target.value })} />
          </Bloc>
        )}
      </div>
      {kind !== 'trigger' && (
        <div className="p-4 border-t border-white/[0.06]">
          <button type="button" onClick={onSupprimer} data-testid="auto-supprimer-bloc"
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg border border-rose-500/30 text-rose-300 text-[13px] hover:bg-rose-500/10">
            <Trash2 className="w-4 h-4" />{t('auto.supprimerBloc')}
          </button>
        </div>
      )}
    </div>
  );
}
