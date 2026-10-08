import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { coachService } from '../services/coachService';
import MiniGraphe from '../components/coach/MiniGraphe';

/**
 * Rico Coach : le plan d'action du mois (plans_mensuels) présenté par Rico, avec le
 * diagnostic qui l'a produit et la courbe des derniers mois. Les phrases du plan viennent du
 * serveur (règles + formulation vérifiée) ; cette page ne calcule aucun chiffre.
 * « Générer » ouvre le Studio, qui génère directement le sujet (format + réseau choisis).
 */

const RICO = 'https://res.cloudinary.com/dy9gp5pim/image/upload/w_420,q_auto,f_auto/brand/rico';
const NOM_RESEAU = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', googlebusiness: 'Google', twitter: 'X' };
const COULEUR_RESEAU = { instagram: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)', linkedin: '#0A66C2', facebook: '#1877F2', tiktok: '#111', youtube: '#FF0000', twitter: '#111' };
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// Genre d'action du plan -> brief Studio
const VERS_STUDIO = {
  post: (s, r) => ({ texte: s, format: 'post', reseau: r }),
  carrousel: (s, r) => ({ texte: s, format: 'carrousel', reseau: r }),
  story: (s, r) => ({ texte: s, format: 'story', reseau: r }),
  reel: (s) => ({ texte: s, format: 'script', type: 'Reel' }),
  actualite_google: (s) => ({ texte: s, format: 'post', reseau: 'googlebusiness' }),
};

function Bouton({ children, onClick, variante = 'plein', testid }) {
  const base = 'rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold font-inter whitespace-nowrap transition-transform duration-150 active:scale-[0.97]';
  const style = variante === 'plein'
    ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:brightness-110'
    : 'border border-white/[0.12] text-slate-100 hover:bg-white/[0.04]';
  return <button type="button" onClick={onClick} data-testid={testid} className={`${base} ${style}`}>{children}</button>;
}

function Carte({ children, className = '' }) {
  return <div className={`rounded-2xl border border-white/[0.07] bg-[#0f172a] ${className}`}>{children}</div>;
}

export default function RicoCoachPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    coachService.ecran().then(setDonnees).catch(() => setErreur(true));
  }, []);

  const langue = i18n.language || 'fr';
  const nf = useMemo(() => new Intl.NumberFormat(langue, { maximumFractionDigits: 2 }), [langue]);
  const fmt = (n) => (n === null || n === undefined ? '—' : nf.format(n).replace(/[  ]/g, ' '));
  const nomMois = (iso, court = false) => new Intl.DateTimeFormat(langue, { month: court ? 'short' : 'long', timeZone: 'UTC' }).format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
  const jour = (nomFr) => t(`coach.jours.${nomFr}`, { defaultValue: nomFr });

  const generer = (liste) => navigate('/dashboard/studio', { state: { coach: liste } });

  if (erreur) return <p className="text-slate-400 font-inter">{t('coach.erreur')}</p>;
  if (!donnees) return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>;

  const { plan, diagnostic: d, serie } = donnees;

  // Aucun plan encore : Rico explique quand il arrive.
  if (!plan) {
    return (
      <Carte className="flex items-end gap-6 px-6 pt-6 overflow-hidden">
        <img src={`${RICO}/accueille.png`} alt="" className="w-28 sm:w-36 shrink-0 translate-y-1.5" />
        <div className="pb-6">
          <h1 className="font-sora text-xl font-bold text-white">{t('coach.vide.titre')}</h1>
          <p className="text-slate-400 font-inter mt-2 max-w-[60ch]">{t('coach.vide.texte')}</p>
        </div>
      </Carte>
    );
  }

  const recos = plan.recommandations || [];
  const moisPlan = String(plan.mois).slice(0, 10);
  const moisDiag = String(plan.diagnostic_mois).slice(0, 10);
  const evo = d?.evolution || [];
  const tous = evo.find((e) => e.reseau === 'tous');
  const reseaux = evo.filter((e) => e.reseau !== 'tous');
  const postsFenetre = serie.slice(-3).reduce((s, m) => s + m.posts, 0);
  const moisPrecedent = new Date(Date.UTC(Number(moisDiag.slice(0, 4)), Number(moisDiag.slice(5, 7)) - 2, 1)).toISOString();
  // Le créneau garde le nom du jour dans ses chiffres (plans récents) ; sinon celui du diagnostic.
  const jourCreneau = (r) => r.chiffres?.jour || JOURS[d?.creneaux?.[0]?.jour] || '';

  const titreReco = (r) => {
    const fmtNom = t(`coach.formats.${(d?.formats || []).find((f) => f.reseau === r.reseau)?.meilleur?.format || 'image'}`);
    return t(`coach.titres.${r.type}`, { reseau: NOM_RESEAU[r.reseau] || r.reseau, format: fmtNom, jour: jour(jourCreneau(r)), heure: r.chiffres?.heure });
  };

  const chiffreReco = (r) => {
    const c = r.chiffres || {};
    switch (r.type) {
      case 'volume_chute': return <>{fmt(c.avant)} <span className="text-rose-400">→</span> {fmt(c.maintenant)}</>;
      case 'volume_reprise': return <>{fmt(c.cible)}<span className="text-base text-slate-400"> /{t('coach.semaineCourt')}</span></>;
      case 'cadence': return <>{fmt(c.actuel)} <span className="text-[#3AFFA3]">→</span> {fmt(c.cible)}</>;
      case 'regularite': return <>{fmt(c.silence)} {t('coach.joursCourt')}</>;
      case 'format': return <span className="bg-gradient-to-r from-[#3AFFA3] to-[#9dffd1] bg-clip-text text-transparent">×{fmt(c.ratio)}</span>;
      case 'top_post': return <>{fmt(c.taux)} %</>;
      case 'creneau': return <>{jour(jourCreneau(r)).slice(0, 3)}. {c.heure} h</>;
      case 'fiche_google_baisse': return <span className="text-rose-400">−{fmt(c.baisse)} %</span>;
      case 'fiche_google_entretien': return <>{fmt(c.appels)}</>;
      default: return null;
    }
  };

  const extraReco = (r) => {
    if (r.type === 'format') {
      const f = (d?.formats || []).find((x) => x.reseau === r.reseau);
      if (!f) return null;
      const top = Math.max(...f.formats.map((x) => x.taux_engagement || 0)) || 1;
      return (
        <div className="grid gap-2 mt-3.5 max-w-[420px]">
          {f.formats.map((x) => (
            <div key={x.format} className="grid grid-cols-[100px_minmax(0,1fr)_56px] gap-2.5 items-center text-[12.5px] font-inter">
              <span className="text-slate-300">{t(`coach.formatsCourt.${x.format}`, { defaultValue: x.format })} · {x.posts}</span>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <i className={`block h-full rounded-full ${x.format === f.meilleur?.format ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]' : 'bg-slate-700'}`}
                  style={{ width: `${Math.max(3, ((x.taux_engagement || 0) / top) * 100)}%` }} />
              </div>
              <b className="text-right tabular-nums text-slate-100">{fmt(x.taux_engagement)} %</b>
            </div>
          ))}
        </div>
      );
    }
    if (r.type === 'top_post') {
      const p = d?.top_posts?.meilleurs?.[0];
      if (!p?.titre) return null;
      return (
        <blockquote className="mt-3.5 rounded-xl border border-white/[0.07] bg-[#111b30] px-4 py-3.5 font-sora font-medium text-[14.5px] leading-snug text-slate-100">
          « {p.titre} »
          <small className="block font-inter font-normal text-xs text-slate-500 mt-2">
            {NOM_RESEAU[p.reseau] || p.reseau} · {new Date(p.publie_le).toLocaleDateString(langue, { day: 'numeric', month: 'long' })} · {fmt(p.impressions || p.vues)} {t('coach.impressions')} · {fmt(p.taux_engagement)} % {t('coach.dEngagement')}
          </small>
        </blockquote>
      );
    }
    return null;
  };

  const actionsReco = (r) => {
    if (r.type === 'creneau') return <Bouton variante="contour" onClick={() => navigate('/dashboard/parametres?s=schedules')}>{t('coach.planifier')}</Bouton>;
    if (r.type === 'connecter_reseaux') return <Bouton onClick={() => navigate('/dashboard/parametres?s=connections')}>{t('coach.connecter')}</Bouton>;
    return null;
  };

  return (
    <div className="max-w-[1320px]">
      {/* Rico présente le plan */}
      <section className="relative grid grid-cols-[92px_minmax(0,1fr)] sm:grid-cols-[168px_minmax(0,1fr)] items-end gap-x-4 sm:gap-x-7 px-5 sm:px-8 pt-5 sm:pt-7 mb-7 rounded-[20px] border border-white/[0.07] overflow-hidden"
        style={{ background: 'radial-gradient(120% 140% at 0% 100%, rgba(91,108,255,0.22), transparent 55%), radial-gradient(80% 120% at 100% 0%, rgba(138,108,255,0.12), transparent 60%), #0f172a' }}>
        <img src={`${RICO}/accueille.png`} alt={t('coach.ricoAlt')} className="w-[92px] sm:w-[168px] self-end translate-y-1.5" />
        <div className="pb-5 sm:pb-7 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-400 font-inter mb-3">
            <span className="whitespace-nowrap rounded-full border border-white/[0.12] px-2.5 py-0.5 font-medium text-slate-100">{majuscule(t('coach.planDe', { mois: nomMois(moisPlan) }))}</span>
            <span>{t('coach.tireDe', { mois: nomMois(moisDiag) })}</span>
          </div>
          <div className="relative inline-block max-w-[640px] rounded-[18px] rounded-bl-md bg-white px-5 py-4 font-sora font-semibold text-[#0b1322] text-lg sm:text-2xl leading-snug shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]">
            {plan.intro}
          </div>
          {postsFenetre > 0 && (
            <p className="hidden sm:block text-slate-400 font-inter mt-3.5 max-w-[62ch]">
              {t('coach.lu', { count: postsFenetre, debut: nomMois(serie.slice(-3)[0].mois), fin: nomMois(moisDiag), n: recos.length })}
            </p>
          )}
        </div>
      </section>

      {/* Courbe des derniers mois : 3 petits graphiques, une échelle chacun */}
      {serie.length >= 2 && (
        <Carte className="px-5 pt-4 pb-3.5 mb-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
            <h2 className="font-sora text-[17px] font-semibold text-white">{t('coach.courbe.titre', { mois: nomMois(serie[0].mois) })}</h2>
            <span className="text-xs text-slate-500 font-inter">{t('coach.courbe.sous')}</span>
          </div>
          <div className="grid gap-5 md:grid-cols-3 md:gap-7">
            {[
              { cle: 'impressions', type: 'aire', valeurs: serie.map((m) => m.impressions), sous: t('coach.courbe.enMois', { mois: nomMois(moisDiag) }) },
              { cle: 'posts', type: 'barres', valeurs: serie.map((m) => m.posts), sous: t('coach.courbe.enMois', { mois: nomMois(moisDiag) }) },
              { cle: 'abonnes', type: 'ligne', valeurs: serie.map((m) => m.abonnes).filter((v) => v !== null), depuisZero: false },
            ].map((g) => {
              const derniere = g.valeurs[g.valeurs.length - 1];
              const etiquettes = g.cle === 'abonnes' ? serie.filter((m) => m.abonnes !== null).map((m) => nomMois(m.mois, true)) : serie.map((m) => nomMois(m.mois, true));
              const sous = g.cle === 'abonnes' && g.valeurs.length > 1
                ? t('coach.courbe.depuis', { delta: `${derniere - g.valeurs[0] >= 0 ? '+' : ''}${fmt(derniere - g.valeurs[0])}`, mois: etiquettes[0] })
                : g.sous;
              return (
                <figure key={g.cle} className="m-0 min-w-0">
                  <h3 className="text-xs font-semibold text-slate-400 font-inter">{t(`coach.courbe.${g.cle}`)}</h3>
                  <div className="font-sora text-xl font-semibold text-white tabular-nums">{fmt(derniere)}<small className="font-inter text-xs font-medium text-slate-500 ml-1.5">{sous}</small></div>
                  {g.valeurs.length >= 2 && <MiniGraphe id={`coach-${g.cle}`} valeurs={g.valeurs} etiquettes={etiquettes} type={g.type} depuisZero={g.depuisZero !== false} unite={t(`coach.unites.${g.cle}`)} fmt={fmt} />}
                </figure>
              );
            })}
          </div>
        </Carte>
      )}

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)] items-start">
        {/* Les actions du mois */}
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-3.5">
            <h2 className="font-sora text-[17px] font-semibold text-white">{t('coach.actions', { count: recos.length })}</h2>
            <span className="text-xs text-slate-500 font-inter">{t('coach.ordre')}</span>
          </div>
          <div className="flex flex-col gap-3.5">
            {recos.map((r, i) => {
              const chiffre = chiffreReco(r);
              const genre = r.action?.genre;
              const briefs = genre && VERS_STUDIO[genre] ? (r.sujets || []).map((s) => VERS_STUDIO[genre](s, r.action.reseau)) : [];
              return (
                <Carte key={r.id} className="p-4 sm:px-[22px] sm:py-5 grid grid-cols-[30px_minmax(0,1fr)] sm:grid-cols-[36px_minmax(0,1fr)_auto] gap-x-4 gap-y-1" >
                  <div className={`w-[30px] h-[30px] rounded-[9px] grid place-items-center font-sora font-bold text-[13px] ${i === 0 ? 'bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] text-white' : 'bg-white/5 text-slate-400 border border-white/[0.07]'}`}>{i + 1}</div>
                  <div className="min-w-0">
                    <div className="text-[11px] tracking-[0.1em] uppercase text-slate-500 font-semibold font-inter">{t(`coach.types.${r.type}`)}</div>
                    <h3 className="font-sora text-base font-semibold text-white mt-0.5 mb-1.5">{titreReco(r)}</h3>
                    <p className="text-slate-300 font-inter m-0 max-w-[64ch]">{r.texte}</p>
                    {extraReco(r)}
                  </div>
                  {chiffre && (
                    <div className="col-start-2 sm:col-start-auto sm:text-right mt-1.5 sm:mt-0 font-sora text-2xl sm:text-[30px] font-semibold leading-none tracking-tight text-white tabular-nums whitespace-nowrap">{chiffre}</div>
                  )}
                  <div className="col-span-full sm:col-start-2">
                    {briefs.length > 0 && (
                      <ul className="mt-3.5 border-t border-white/[0.07] list-none p-0 m-0">
                        {briefs.map((b, k) => (
                          <li key={k} className="flex flex-wrap sm:flex-nowrap items-center gap-3 py-2.5 border-b border-white/[0.07] last:border-b-0 last:pb-0">
                            <span className="basis-full sm:basis-auto flex-1 text-slate-100 font-inter">{b.texte}</span>
                            <em className="not-italic text-[11px] text-slate-400 border border-white/[0.12] rounded-md px-2 py-0.5 whitespace-nowrap">
                              {t(`coach.genres.${genre}`)}{b.reseau && genre !== 'actualite_google' ? ` · ${NOM_RESEAU[b.reseau] || b.reseau}` : ''}
                            </em>
                            <span className="ml-auto sm:ml-0"><Bouton onClick={() => generer([b])} testid={`coach-generer-${r.id}-${k}`}>{t('coach.generer')}</Bouton></span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(briefs.length > 1 || actionsReco(r)) && (
                      <div className="flex flex-wrap items-center gap-2.5 mt-3.5">
                        {briefs.length > 1 && <Bouton variante="contour" onClick={() => generer(briefs)} testid={`coach-generer-tous-${r.id}`}>{t('coach.genererTous', { count: briefs.length })}</Bouton>}
                        {briefs.length > 1 && <small className="text-xs text-slate-500 font-inter">{t('coach.quota')}</small>}
                        {actionsReco(r)}
                      </div>
                    )}
                  </div>
                </Carte>
              );
            })}
          </div>

          {/* Étape suivante : questions à Rico avec les chiffres du compte */}
          <label className="mt-7 flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-[#0f172a] py-2.5 pl-4 pr-2.5">
            <img src={`${RICO}/lit-tablette.png`} alt="" className="w-[34px] h-[34px] object-contain" />
            <input type="text" disabled placeholder={t('coach.question')} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-slate-100 placeholder:text-slate-500 font-inter text-sm" />
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#8A6CFF]/15 text-violet-300 border border-[#8A6CFF]/30 whitespace-nowrap">{t('coach.bientot')}</span>
          </label>
        </section>

        {/* Le diagnostic qui a produit le plan */}
        {d && (
          <aside className="rounded-2xl border border-white/[0.07] bg-[#0f172a] overflow-hidden lg:sticky lg:top-6">
            {tous && (
              <div className="px-5 py-4 border-b border-white/[0.07]">
                <h2 className="font-sora text-[15px] font-semibold text-white mb-3">{t('coach.diag.titre')}</h2>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3.5 gap-y-1.5 items-baseline font-inter tabular-nums m-0">
                  <dt /><dd className="m-0 text-right text-[11px] text-slate-500 capitalize">{nomMois(moisDiag)}</dd><dd className="m-0 text-right text-[11px] text-slate-500 capitalize">{nomMois(moisPrecedent)}</dd>
                  {[
                    ['publications', tous.actuel.posts, tous.precedent?.posts, null],
                    ['impressions', tous.actuel.impressions, tous.precedent?.impressions, tous.variations?.impressions],
                    ['engagement', tous.actuel.taux_engagement, tous.precedent?.taux_engagement, null, ' %'],
                    ['abonnesGagnes', tous.actuel.abonnes_gagnes, tous.precedent?.abonnes_gagnes, null, '', true],
                    ['abonnesTotal', tous.actuel.abonnes, tous.precedent?.abonnes, null],
                  ].map(([cle, a, p, varPct, suffixe = '', signe = false]) => (
                    <div key={cle} className="contents">
                      <dt className="text-slate-400">{t(`coach.diag.${cle}`)}</dt>
                      <dd className="m-0 text-right font-sora font-semibold text-[15px] text-white whitespace-nowrap">
                        {a === null || a === undefined ? '—' : `${signe && a > 0 ? '+' : ''}${fmt(a)}${suffixe}`}
                        {varPct !== null && varPct !== undefined && Math.abs(varPct) >= 10 && (
                          <span className={`ml-1 text-[11px] font-semibold px-1.5 rounded-md ${varPct < 0 ? 'text-rose-400 bg-rose-400/10' : 'text-[#3AFFA3] bg-[#3AFFA3]/10'}`}>{varPct > 0 ? '+' : '−'}{fmt(Math.round(Math.abs(varPct)))} %</span>
                        )}
                      </dd>
                      <dd className="m-0 text-right text-xs text-slate-500">{p === null || p === undefined ? '—' : `${signe && p > 0 ? '+' : ''}${fmt(p)}${suffixe}`}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {reseaux.length > 0 && (
              <div className="px-5 py-4 border-b border-white/[0.07]">
                <h3 className="text-xs uppercase tracking-[0.1em] text-slate-500 font-semibold font-inter mb-3">{t('coach.diag.parReseau')}</h3>
                <div className="grid gap-2.5 font-inter tabular-nums">
                  {reseaux.map((e) => (
                    <div key={e.reseau} className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-2.5 items-center">
                      <span className="w-5 h-5 rounded-[5px] grid place-items-center text-[10px] font-bold text-white" style={{ background: COULEUR_RESEAU[e.reseau] || '#334155' }}>{(NOM_RESEAU[e.reseau] || e.reseau).slice(0, 2)}</span>
                      <p className="m-0 text-slate-100">{NOM_RESEAU[e.reseau] || e.reseau} <small className="text-slate-500">· {e.actuel.posts ? t('coach.diag.ligneReseau', { count: e.actuel.posts, impressions: fmt(e.actuel.impressions || e.actuel.vues) }) : t('coach.diag.aucunPost')}</small></p>
                      <small className="text-slate-500">{e.precedent ? t('coach.diag.postsAvant', { count: e.precedent.posts }) : ''}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.volume && (
              <div className="px-5 py-4 border-b border-white/[0.07]">
                <h3 className="text-xs uppercase tracking-[0.1em] text-slate-500 font-semibold font-inter mb-3">{t('coach.diag.regularite', { mois: nomMois(moisDiag) })}</h3>
                {Array.isArray(d.volume.semaines_liste) && <SemainesActives volume={d.volume} />}
                <p className="m-0 text-[12.5px] text-slate-400 font-inter">{t('coach.diag.semaines', { actives: d.volume.semaines_actives, total: d.volume.semaines_du_mois, silence: d.volume.plus_long_silence_jours })}</p>
              </div>
            )}

            {d.creneaux?.length > 0 && (
              <div className="px-5 py-4 border-b border-white/[0.07]">
                <h3 className="text-xs uppercase tracking-[0.1em] text-slate-500 font-semibold font-inter mb-3">{t('coach.diag.creneaux')}</h3>
                <ul className="m-0 p-0 list-none grid gap-2 font-inter tabular-nums">
                  {d.creneaux.map((c, k) => (
                    <li key={k} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 items-center">
                      <span className="text-slate-100 capitalize">{jour(JOURS[c.jour])}, {c.heure} h <small className="text-slate-500 normal-case">· {t('coach.diag.posts', { count: c.posts })}</small></span>
                      <b className={k === 0 ? 'text-[#3AFFA3]' : 'text-slate-100'}>{fmt(c.engagement)} %</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="px-5 py-4 border-b border-white/[0.07]">
              <h3 className="text-xs uppercase tracking-[0.1em] text-slate-500 font-semibold font-inter mb-3">{t('coach.diag.fiche')}</h3>
              {d.fiche_google ? (
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1.5 gap-x-3 m-0 font-inter tabular-nums">
                  {['appels', 'itineraires', 'clics_site', 'vues_recherche', 'vues_maps'].map((k) => (
                    <div key={k} className="contents">
                      <dt className="text-slate-400">{t(`coach.diag.fiche_${k}`)}</dt>
                      <dd className="m-0 text-right text-slate-100 font-semibold">{fmt(d.fiche_google.actuel?.[k])}
                        {d.fiche_google.variations?.[k] !== null && d.fiche_google.variations?.[k] !== undefined && (
                          <span className={`ml-1 text-[11px] ${d.fiche_google.variations[k] < 0 ? 'text-rose-400' : 'text-[#3AFFA3]'}`}>{d.fiche_google.variations[k] > 0 ? '+' : ''}{fmt(Math.round(d.fiche_google.variations[k]))} %</span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="flex gap-3 items-start">
                  <span className="w-[34px] h-[34px] shrink-0 rounded-[10px] border border-dashed border-white/20 grid place-items-center text-slate-500 font-semibold">G</span>
                  <div>
                    <p className="m-0 mb-2 text-[13px] text-slate-400 font-inter">{t('coach.diag.ficheVide')}</p>
                    <button type="button" onClick={() => navigate('/dashboard/parametres?s=connections')} className="text-[13px] font-semibold text-indigo-300 hover:text-indigo-200">{t('coach.diag.connecterFiche')}</button>
                  </div>
                </div>
              )}
            </div>
            {d.calcule_le && (
              <div className="px-5 py-3 text-[11.5px] text-slate-500 font-inter bg-white/[0.015]">
                {t('coach.diag.source', { date: new Date(d.calcule_le).toLocaleDateString(langue, { day: 'numeric', month: 'long' }) })}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

/** Une case par tranche de 7 jours du mois analysé ; pleine si au moins un post. */
function SemainesActives({ volume }) {
  const total = volume.semaines_du_mois || 5;
  const pleines = new Set(volume.semaines_liste);
  const cases = Array.from({ length: total }, (_, i) => i);
  return (
    <div className="grid gap-1.5 mb-2" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
      {cases.map((i) => (
        <i key={i} className={`h-[26px] rounded-md ${pleines.has(i) ? 'bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF]' : 'bg-white/[0.04] border border-dashed border-white/[0.08]'}`} />
      ))}
    </div>
  );
}
