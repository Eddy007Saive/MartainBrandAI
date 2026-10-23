import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lightbulb, Upload, Loader2, Sparkles, Video, Film, RotateCw, Check, AlertTriangle, X } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { contenuService } from '../services/contenuService';
import { agentService } from '../services/agentService';

/**
 * « M'inspirer d'un reel qui marche » : le client importe un reel de référence, l'IA explique
 * pourquoi il marche (accroche, structure, rythme), puis écrit un script pour sa marque qui en
 * reprend la structure (jamais le contenu). Le script part ensuite au tournage (Studio Vidéo)
 * ou devient un reel animé (Studio Reel).
 */
const MAX_OCTETS = 60 * 1024 * 1024;
const COULEUR_ROLE = {
  accroche: '#8A6CFF', probleme: '#f87171', contexte: '#64748b', preuve: '#3AFFA3',
  bascule: '#fbbf24', astuce: '#38bdf8', demonstration: '#38bdf8', appel: '#f472b6',
};
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A6CFF]';
const BTN = `inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-4 rounded-[10px] text-[13px] font-semibold font-inter transition-colors duration-150 disabled:opacity-50 ${FOCUS}`;
const BTN_PRINCIPAL = `${BTN} bg-[#5a4ae8] text-white hover:bg-[#6757f0]`;
const BTN_SECONDAIRE = `${BTN} border border-white/15 text-slate-100 hover:bg-white/[0.06]`;

const fmtS = (s) => `${Math.round(Number(s) || 0)} s`;

/** Le script en texte simple, tel qu'il sera enregistré dans Contenus. */
const scriptEnTexte = (s, t) => s.lignes.map((l) => [
  `[${Math.round(l.debut)}-${Math.round(l.fin)} s] ${l.voix}`,
  l.texte_ecran ? `  ${t('inspiration.aLEcran')} : ${l.texte_ecran}` : '',
  l.plan ? `  ${t('inspiration.plan')} : ${l.plan}` : '',
].filter(Boolean).join('\n')).join('\n\n');

export default function InspirationReel() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fichierRef = useRef(null);
  const [fichier, setFichier] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [sujet, setSujet] = useState('');
  const [analyse, setAnalyse] = useState(null);
  const [resultat, setResultat] = useState(null);   // { script, controle, passes }
  const [etape, setEtape] = useState(null);         // 'analyse' | 'script' | 'envoi' | null

  // Depuis un post de Contenus : son texte devient le sujet.
  useEffect(() => {
    const id = params.get('contenu');
    if (!id) return;
    contenuService.getById(id).then((c) => setSujet((c.contenu || c.script || c.titre || '').slice(0, 3000))).catch(() => {});
  }, [params]);
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  const choisir = (f) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) { toast.error(t('inspiration.erreurFormat')); return; }
    if (f.size > MAX_OCTETS) { toast.error(t('inspiration.erreurTaille')); return; }
    if (apercu) URL.revokeObjectURL(apercu);
    setFichier(f); setApercu(URL.createObjectURL(f)); setAnalyse(null); setResultat(null);
  };

  const analyser = async () => {
    if (!fichier) return;
    setEtape('analyse'); setResultat(null);
    try {
      const r = await contenuService.inspirationAnalyser(fichier);
      setAnalyse(r.analyse);
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.message || t('inspiration.erreurAnalyse'));
    } finally { setEtape(null); }
  };

  const ecrire = async () => {
    if (!analyse) return;
    if (!sujet.trim()) { toast.error(t('inspiration.sujetRequis')); return; }
    setEtape('script');
    try {
      setResultat(await contenuService.inspirationScript({ analyse, sujet: sujet.trim() }));
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.message || t('inspiration.erreurScript'));
    } finally { setEtape(null); }
  };

  // Le script devient un brouillon de script dans Contenus, puis part au tournage ou au Studio Reel.
  const envoyer = async (vers) => {
    setEtape('envoi');
    try {
      const s = resultat.script;
      const d = await agentService.creerBrouillon({ titre: s.accroche.slice(0, 80), script: scriptEnTexte(s, t) });
      const id = d?.contenu_id;
      if (!id) throw new Error('pas de contenu');
      navigate(vers === 'tourner' ? `/dashboard/video?contenu_id=${id}` : `/dashboard/reel?contenu=${id}`);
    } catch (e) {
      if (!e.__handled) toast.error(t('inspiration.erreurEnvoi'));
      setEtape(null);
    }
  };

  const total = analyse ? Math.max(1, analyse.duree_s || (analyse.structure.at(-1)?.fin ?? 1)) : 1;
  const occupe = etape !== null;

  return (
    <div className="max-w-5xl mx-auto pb-10" data-testid="inspiration-reel">
      <PageHeader icon={Lightbulb} title={t('inspiration.titre')} subtitle={t('inspiration.sousTitre')} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8 items-start">
        {/* 1-2 : le reel de référence et le sujet */}
        <section aria-labelledby="insp-entree" className="space-y-6">
          <div>
            <h2 id="insp-entree" className="text-[16px] font-bold font-sora text-white">{t('inspiration.etape1')}</h2>
            <p className="text-[13px] text-slate-400 font-inter mt-1">{t('inspiration.etape1Aide')}</p>
            <input ref={fichierRef} type="file" accept="video/*" className="hidden" data-testid="inspiration-fichier"
              onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ''; }} />
            {apercu ? (
              <div className="mt-3 flex gap-4 items-start">
                <video src={apercu} controls playsInline className="w-[150px] aspect-[9/16] rounded-xl bg-black object-cover border border-white/10" />
                <div className="min-w-0 space-y-2">
                  <p className="text-[13px] text-slate-200 font-inter break-all">{fichier?.name}</p>
                  <button type="button" onClick={() => fichierRef.current?.click()} disabled={occupe} className={BTN_SECONDAIRE}>
                    <Upload className="w-4 h-4" aria-hidden="true" />{t('inspiration.changerVideo')}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fichierRef.current?.click()} data-testid="inspiration-importer"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); choisir(e.dataTransfer.files?.[0]); }}
                className={`mt-3 w-full rounded-xl border border-dashed border-white/20 hover:border-white/40 px-5 py-8 text-center transition-colors duration-150 ${FOCUS}`}>
                <Upload className="w-6 h-6 text-slate-300 mx-auto" aria-hidden="true" />
                <span className="block mt-2 text-[14px] font-semibold text-white font-inter">{t('inspiration.importer')}</span>
                <span className="block mt-1 text-[12px] text-slate-400 font-inter">{t('inspiration.importerAide')}</span>
              </button>
            )}
          </div>

          <div>
            <label htmlFor="insp-sujet" className="block text-[16px] font-bold font-sora text-white">{t('inspiration.etape2')}</label>
            <p className="text-[13px] text-slate-400 font-inter mt-1">{t('inspiration.etape2Aide')}</p>
            <textarea id="insp-sujet" value={sujet} onChange={(e) => setSujet(e.target.value)} rows={4} maxLength={3000} data-testid="inspiration-sujet"
              placeholder={t('inspiration.sujetPh')}
              className={`mt-2 w-full resize-y bg-slate-950/60 border border-white/10 text-slate-100 text-[13.5px] font-inter rounded-lg px-3 py-2 outline-none focus:border-[#8A6CFF]/60 placeholder:text-slate-500 ${FOCUS}`} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={analyser} disabled={!fichier || occupe} data-testid="inspiration-analyser" className={BTN_PRINCIPAL}>
              {etape === 'analyse' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
              {etape === 'analyse' ? t('inspiration.analyseEnCours') : analyse ? t('inspiration.reanalyser') : t('inspiration.analyser')}
            </button>
            <p className="text-[12px] text-slate-400 font-inter">{t('inspiration.cout')}</p>
          </div>
        </section>

        {/* 3 : pourquoi il marche, puis le script */}
        <section aria-live="polite" className="space-y-6 min-w-0">
          {!analyse && etape !== 'analyse' && (
            <div className="rounded-xl border border-white/[0.06] px-5 py-8 text-center">
              <Film className="w-7 h-7 text-slate-500 mx-auto" aria-hidden="true" />
              <p className="mt-2 text-[13.5px] text-slate-300 font-inter max-w-sm mx-auto">{t('inspiration.vide')}</p>
            </div>
          )}
          {etape === 'analyse' && (
            <div className="rounded-xl border border-white/[0.06] px-5 py-8 text-center" role="status">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" aria-hidden="true" />
              <p className="mt-2 text-[13.5px] text-slate-300 font-inter">{t('inspiration.analyseAttente')}</p>
            </div>
          )}

          {analyse && (
            <div data-testid="inspiration-analyse" className="space-y-5">
              <h2 className="text-[16px] font-bold font-sora text-white">{t('inspiration.pourquoi')}</h2>
              <figure className="m-0 rounded-xl bg-white/[0.035] px-4 py-3.5">
                <figcaption className="text-[12px] font-medium text-slate-400 font-inter">{t('inspiration.accroche', { n: analyse.accroche.mots })}</figcaption>
                <blockquote className="mt-1 text-[16px] font-semibold text-white font-sora leading-snug [text-wrap:pretty]">«&nbsp;{analyse.accroche.texte}&nbsp;»</blockquote>
                {analyse.accroche.pourquoi && <p className="mt-1.5 text-[13px] text-slate-300 font-inter">{analyse.accroche.pourquoi}</p>}
              </figure>

              <div>
                <p className="text-[13px] font-semibold text-slate-200 font-inter">{t('inspiration.structure', { duree: fmtS(total) })}</p>
                <div className="mt-2 flex h-3 rounded-full overflow-hidden bg-white/[0.05]" aria-hidden="true">
                  {analyse.structure.map((s, i) => (
                    <span key={i} title={s.role} style={{ width: `${Math.max(2, ((s.fin - s.debut) / total) * 100)}%`, background: COULEUR_ROLE[s.role] || '#94a3b8' }} />
                  ))}
                </div>
                <ol className="mt-3 space-y-1.5">
                  {analyse.structure.map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] font-inter">
                      <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: COULEUR_ROLE[s.role] || '#94a3b8' }} aria-hidden="true" />
                      <span className="tabular-nums text-slate-400 w-16 shrink-0">{Math.round(s.debut)}-{Math.round(s.fin)} s</span>
                      <span className="text-slate-200"><b className="font-semibold">{t(`inspiration.role.${s.role}`, s.role)}</b>{s.resume ? ` : ${s.resume}` : ''}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <dl className="grid grid-cols-3 gap-3 text-center">
                {[
                  [t('inspiration.plans'), analyse.rythme.plans || '–'],
                  [t('inspiration.coupe'), analyse.rythme.coupe_toutes_s ? `${Number(analyse.rythme.coupe_toutes_s).toLocaleString(i18n.language, { maximumFractionDigits: 1 })} s` : '–'],
                  [t('inspiration.texteEcran'), analyse.rythme.texte_ecran || '–'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-white/[0.07] px-2 py-2.5">
                    <dt className="text-[11.5px] text-slate-400 font-inter">{k}</dt>
                    <dd className="m-0 mt-0.5 text-[15px] font-semibold text-white font-inter tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              {analyse.technique_cle && (
                <p className="text-[13.5px] text-slate-200 font-inter leading-relaxed">
                  <b className="text-white">{t('inspiration.technique')}</b> {analyse.technique_cle}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={ecrire} disabled={occupe} data-testid="inspiration-ecrire" className={resultat ? BTN_SECONDAIRE : BTN_PRINCIPAL}>
                  {etape === 'script' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : resultat ? <RotateCw className="w-4 h-4" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                  {etape === 'script' ? t('inspiration.scriptEnCours') : resultat ? t('inspiration.reecrire') : t('inspiration.ecrire')}
                </button>
                {etape === 'script' && <p className="text-[12px] text-slate-400 font-inter">{t('inspiration.scriptAttente')}</p>}
              </div>
            </div>
          )}

          {resultat && (
            <div data-testid="inspiration-script" className="space-y-4 border-t border-white/[0.06] pt-6">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-[16px] font-bold font-sora text-white">{t('inspiration.tonScript', { duree: fmtS(resultat.script.duree_s) })}</h2>
                <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold font-inter ${resultat.controle.score >= 90 ? 'text-[#3AFFA3]' : 'text-amber-300'}`} data-testid="inspiration-score">
                  {resultat.controle.score >= 90 ? <Check className="w-4 h-4" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4" aria-hidden="true" />}
                  {t('inspiration.note', { score: resultat.controle.score })}
                </span>
              </div>
              <ol className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
                {resultat.script.lignes.map((l, i) => (
                  <li key={i} className="py-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
                    <span className="text-[12px] text-slate-400 font-inter tabular-nums pt-0.5">{Math.round(l.debut)}-{Math.round(l.fin)} s</span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[14px] text-white font-inter leading-snug">{l.voix}</p>
                      {l.texte_ecran && <p className="text-[12.5px] text-slate-300 font-inter"><span className="text-slate-400">{t('inspiration.aLEcran')} :</span> {l.texte_ecran}</p>}
                      {l.plan && <p className="text-[12.5px] text-slate-300 font-inter"><span className="text-slate-400">{t('inspiration.plan')} :</span> {l.plan}</p>}
                    </div>
                  </li>
                ))}
              </ol>
              {resultat.script.legende && (
                <div>
                  <p className="text-[12.5px] font-medium text-slate-400 font-inter">{t('inspiration.legende')}</p>
                  <p className="mt-1 text-[13.5px] text-slate-200 font-inter whitespace-pre-line">{resultat.script.legende}</p>
                </div>
              )}
              {resultat.controle.violations?.length > 0 && (
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-3">
                  <p className="text-[12.5px] font-semibold text-amber-200 font-inter">{t('inspiration.aRevoir')}</p>
                  <ul className="mt-1 space-y-0.5">
                    {resultat.controle.violations.map((v, i) => <li key={i} className="text-[12.5px] text-amber-100/90 font-inter flex gap-1.5"><X className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />{v}</li>)}
                  </ul>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-2.5 pt-1">
                <button type="button" onClick={() => envoyer('tourner')} disabled={occupe} data-testid="inspiration-tourner" className={BTN_PRINCIPAL}>
                  {etape === 'envoi' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Video className="w-4 h-4" aria-hidden="true" />}{t('inspiration.tourner')}
                </button>
                <button type="button" onClick={() => envoyer('anime')} disabled={occupe} data-testid="inspiration-anime" className={BTN_SECONDAIRE}>
                  <Film className="w-4 h-4" aria-hidden="true" />{t('inspiration.anime')}
                </button>
              </div>
              <p className="text-[12px] text-slate-400 font-inter">{t('inspiration.garde')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
