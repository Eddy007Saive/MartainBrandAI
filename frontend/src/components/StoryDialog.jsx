import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Check, RefreshCw, Sparkles, Film, Image as ImageIcon, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { contenuService } from '../services/contenuService';

/**
 * Décliner un contenu en story.
 *
 * Le FORMAT suit le type de contenu (décidé côté serveur, `format` dans les options) :
 *  - post texte  -> story unique (un écran, sélecteur de modèles + retouche) ;
 *  - carrousel   -> série narrative de 4 à 6 écrans réécrite par l'IA à partir des
 *                   slides (hook → problème → question → valeur → solution → CTA),
 *                   avec l'option « Couverture seule » (une story teaser).
 * Un seul modèle de données pour les deux : `ecrans[]`, l'écran actif est édité.
 *
 * Le RENDU est au choix : statique (image, rendu immédiat) ou animé (Remotion,
 * rendu en arrière-plan ~1-2 min par écran, notification à la fin).
 * On ne crée le(s) contenu(s) qu'à la validation ; le post d'origine n'est jamais modifié.
 */
const ROLE_LABEL = {
  hook: 'Hook', problem: 'Problème', interaction: 'Question', value: 'Valeur',
  revelation: 'Révélation', solution: 'Solution', cta: 'CTA',
};

const ecranDepuisParts = (parts, image) => ({
  role: null, interaction: null,
  accroche: parts?.accroche || '', sous: parts?.sous || '',
  cta: parts?.cta || 'Réponds en DM 👉', image_source: image || null,
});

export default function StoryDialog({ contenu, onClose, onCreated }) {
  const [opts, setOpts] = useState(null); // { format, ecrans, parts, modeles, couleurs, a_un_visuel, … }
  const [tpl, setTpl] = useState(null);
  const [ecrans, setEcrans] = useState([]);          // [{role, interaction, accroche, sous, cta, image_source}]
  const [ecranActif, setEcranActif] = useState(0);
  const [formatChoisi, setFormatChoisi] = useState('unique'); // 'serie' | 'unique' (couverture seule)
  const [rendu, setRendu] = useState('statique');    // 'statique' | 'anime'
  const [colors, setColors] = useState(null); // { p, s, a }
  const [points, setPoints] = useState([]);    // modèle « signature » : 3 arguments
  const [baseline, setBaseline] = useState(''); // modèle « signature » : ligne d'offre
  const [preview, setPreview] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);

  const enSerie = opts?.format === 'serie' && formatChoisi === 'serie';
  const anime = rendu === 'anime';
  const ecran = ecrans[ecranActif] || ecranDepuisParts(null, null);
  const setChamp = (k, v) => setEcrans((l) => l.map((e, i) => (i === ecranActif ? { ...e, [k]: v } : e)));

  // Photo à utiliser pour les modèles image (Photo/Photo entière/Photo+bloc) : les
  // slides d'un carrousel si le post en a plusieurs, sinon son unique visuel.
  const photosDisponibles = (Array.isArray(contenu.slides_images) && contenu.slides_images.length
    ? contenu.slides_images
    : (contenu.lien_visuel ? [contenu.lien_visuel] : []));

  const corps = useCallback((t, i = ecranActif) => {
    const e = ecrans[i] || {};
    return {
      template: t, accroche: e.accroche || '', sous: e.sous || '', cta: e.cta || '',
      colors, image_source: e.image_source || null,
      ...(t === 'signature' ? { points, baseline } : {}),
      ...(t === 'liste' ? { points } : {}),
    };
  }, [ecrans, ecranActif, colors, points, baseline]);

  const rendre = useCallback(async (t) => {
    if (!t) return;
    setRendering(true);
    try {
      const d = await contenuService.storyApercu(contenu.id, corps(t));
      setPreview(d.image);
    } catch (e) {
      toast.error(e.response?.data?.detail || "L'aperçu a échoué, réessaie.");
    } finally {
      setRendering(false);
    }
  }, [contenu.id, corps]);

  // Chargement initial : format, écrans/texte pré-remplis, modèles, couleurs de marque
  useEffect(() => {
    let alive = true;
    contenuService.storyOptions(contenu.id).then((d) => {
      if (!alive) return;
      setOpts(d);
      const serie = d.format === 'serie' && Array.isArray(d.ecrans) && d.ecrans.length >= 2;
      setFormatChoisi(serie ? 'serie' : 'unique');
      setEcrans(serie
        ? d.ecrans.map((e) => ({ ...e, cta: e.cta || '', image_source: e.image_source || null }))
        : [ecranDepuisParts(d.parts, contenu.lien_visuel)]);
      setEcranActif(0);
      setColors(d.couleurs);
      // Choisi par l'IA (liste) sinon les 3 arguments maison par défaut (signature).
      setPoints((d.template_suggere === 'liste' && d.points_suggeres?.length
        ? d.points_suggeres : (d.signature?.points || [])).map((p) => ({ ...p })));
      setBaseline(d.signature?.baseline || '');
      const ids = d.modeles.map((m) => m.id);
      // L'IA suggère le gabarit le plus adapté au contenu ; l'utilisateur garde la main
      // via le sélecteur juste après.
      const def = d.a_un_visuel ? 'photo-flou' : 'epure';
      const suggere = d.template_suggere;
      setTpl(suggere && ids.includes(suggere) ? suggere : (ids.includes(def) ? def : ids[0]));
    }).catch((e) => {
      // 402 (quota story épuisé / mur de paiement) est déjà affiché par l'intercepteur
      // global (popup ou toast avec lien vers l'offre) — un second toast ferait doublon.
      if (!e.__handled) toast.error(e.response?.data?.detail || 'Story indisponible pour ce post.');
      onClose();
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenu.id]);

  // (Re)rendu quand on change de modèle, d'écran, de photo source ou de format (choix
  // ponctuels, pas de souci de spam). Le texte courant est capturé volontairement à
  // part : on ne veut pas re-rendre à chaque frappe — d'où l'omission de `rendre`.
  useEffect(() => {
    if (tpl && ecrans.length) rendre(tpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, ecranActif, ecran.image_source, formatChoisi]);

  const choisirFormat = (f) => { setFormatChoisi(f); setEcranActif(0); };

  const valider = async () => {
    setSaving(true);
    try {
      let d;
      if (enSerie) {
        d = await contenuService.storySerie(contenu.id, {
          template: tpl, colors, anime,
          ecrans: ecrans.map(({ accroche, sous, cta, image_source }) => ({ accroche, sous, cta, image_source })),
        });
        toast.success(anime
          ? `${d.count} stories animées en cours de rendu (~${Math.max(2, d.count * 1.5).toFixed(0)} min), tu seras prévenu`
          : `${d.count} stories créées, à valider ensemble pour qu'elles s'enchaînent`);
      } else if (anime) {
        const e0 = ecrans[0] || {};
        d = await contenuService.storyAnimee(contenu.id, { accroche: e0.accroche, sous: e0.sous, cta: e0.cta, colors });
        toast.success('Story animée en cours de rendu (~2 min), tu seras prévenu');
      } else {
        d = await contenuService.storyCreer(contenu.id, { ...corps(tpl, 0), image: preview });
        const dt = d.date_publication
          ? new Date(d.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
          : null;
        toast.success(dt ? `Story créée pour le ${dt}, à valider` : 'Story créée, à valider');
      }
      onCreated?.(d);
      onClose();
    } catch (e) {
      setSaving(false);
      if (!e.__handled) toast.error(e.response?.data?.detail || 'La création de la story a échoué.');
    }
  };

  const resetColors = () => setColors(opts?.couleurs || null);

  const nb = ecrans.length;
  const accrocheManquante = enSerie ? ecrans.some((e) => !(e.accroche || '').trim()) : !(ecran.accroche || '').trim();
  const peutCreer = !saving && !rendering && !accrocheManquante && (anime || !!preview);
  const coutQuota = enSerie ? nb : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl bg-[#0f172a] border border-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="story-dialog"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold font-sora text-[15px] leading-tight">Décliner en story</p>
              <p className="text-slate-500 text-[12px] font-inter">Format 9:16, à la charte · {contenu.reseau_cible}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {!opts ? (
          <div className="flex-1 grid place-items-center py-20 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#5B6CFF]" />
            {contenu.type === 'Carrousel' && (
              <p className="text-[12px] text-slate-500 font-inter">L'IA réécrit ton carrousel en séquence de stories…</p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[300px_1fr] gap-0">
            {/* Aperçu 9:16 */}
            <div className="bg-black/30 border-r border-white/10 p-5 flex flex-col items-center justify-center gap-3">
              <div className="relative w-[220px] aspect-[9/16] rounded-xl overflow-hidden bg-[#0b1020] border border-white/10">
                {preview && <img src={preview} alt="Aperçu de la story" className="w-full h-full object-cover" />}
                {rendering && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[1px]">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  </div>
                )}
                {enSerie && (
                  <span className="absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                    {ecranActif + 1}/{nb}
                  </span>
                )}
              </div>
              <button
                onClick={() => rendre(tpl)} disabled={rendering}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#3AFFA3] hover:underline disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Mettre à jour l'aperçu
              </button>
              {anime && (
                <p className="text-[11px] text-slate-500 font-inter text-center max-w-[220px]">
                  Aperçu statique : l'animation est rendue en arrière-plan (~1-2 min par écran), tu seras prévenu.
                </p>
              )}
            </div>

            {/* Réglages */}
            <div className="p-5 space-y-4">
              {/* Format (carrousel uniquement) : série narrative ou couverture seule */}
              {opts.format === 'serie' && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Format</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['serie', `Série · ${opts.ecrans.length} écrans`, `${opts.ecrans.length} stories de ton quota`],
                      ['unique', 'Couverture seule', '1 story de ton quota'],
                    ].map(([f, lab, sub]) => (
                      <button
                        key={f} onClick={() => choisirFormat(f)}
                        title={f === 'unique' ? 'Une seule story : la couverture du carrousel, pour renvoyer vers le post' : 'Séquence qui se lit à la suite, réécrite par l\'IA à partir des slides'}
                        className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                          formatChoisi === f
                            ? 'bg-[#5B6CFF]/20 border-[#5B6CFF]/50 text-white'
                            : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span className="block text-[13px] font-medium">{lab}</span>
                        <span className="block text-[11px] text-slate-500">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rendu : image statique ou animation Remotion */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Rendu</p>
                <div className="flex flex-wrap gap-2">
                  {[['statique', ImageIcon, 'Statique', 'Image, prête tout de suite'],
                    ['anime', Film, 'Animée', 'Vidéo 5 s, rendue en arrière-plan (~1-2 min par écran)']].map(([r, Icon, lab, hint]) => (
                    <button
                      key={r} onClick={() => setRendu(r)} title={hint}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
                        rendu === r
                          ? 'bg-[#5B6CFF]/20 border-[#5B6CFF]/50 text-white'
                          : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />{lab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Écrans de la série */}
              {enSerie && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Écrans</p>
                  <div className="flex flex-wrap gap-2">
                    {ecrans.map((e, i) => (
                      <button
                        key={i} onClick={() => setEcranActif(i)} title={e.accroche}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
                          ecranActif === i
                            ? 'bg-[#5B6CFF]/20 border-[#5B6CFF]/50 text-white'
                            : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25'
                        } ${!(e.accroche || '').trim() ? 'border-red-400/50' : ''}`}
                      >
                        {i + 1} · {ROLE_LABEL[e.role] || `Écran ${i + 1}`}
                        {e.interaction && e.interaction.type && e.interaction.type !== 'none' && (
                          <MessageCircle className="w-3 h-3 text-[#3AFFA3]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Modèles (statique uniquement : le gabarit animé est unique) */}
              {!anime && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Modèle</p>
                  <div className="flex flex-wrap gap-2">
                    {opts.modeles.map((m) => (
                      <button
                        key={m.id} onClick={() => setTpl(m.id)} title={m.hint}
                        className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
                          tpl === m.id
                            ? 'bg-[#5B6CFF]/20 border-[#5B6CFF]/50 text-white'
                            : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo (modèles Photo/Photo entière/Photo+bloc) : choisir parmi les slides existantes */}
              {!anime && photosDisponibles.length > 1 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Photo{enSerie ? <span className="normal-case text-slate-500"> · de cet écran</span> : null}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {photosDisponibles.map((url, i) => (
                      <button
                        key={url} onClick={() => setChamp('image_source', url)}
                        title={`Slide ${i + 1}`}
                        className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                          ecran.image_source === url ? 'border-[#5B6CFF]' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img src={url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Textes de l'écran actif */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Accroche</label>
                  <textarea
                    value={ecran.accroche} onChange={(e) => setChamp('accroche', e.target.value)} rows={2}
                    className="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[14px] text-white resize-none focus:outline-none focus:border-[#5B6CFF]/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sous-titre</label>
                  <input
                    value={ecran.sous} onChange={(e) => setChamp('sous', e.target.value)}
                    className="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[14px] text-white focus:outline-none focus:border-[#5B6CFF]/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bouton (CTA)</label>
                  <input
                    value={ecran.cta} onChange={(e) => setChamp('cta', e.target.value)}
                    className="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[14px] text-white focus:outline-none focus:border-[#5B6CFF]/50"
                  />
                </div>
                {enSerie && ecran.interaction && ecran.interaction.type && ecran.interaction.type !== 'none' && (
                  <p className="text-[11px] text-slate-500 font-inter flex items-start gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-[#3AFFA3] shrink-0 mt-[1px]" />
                    Écran question : les stickers ne sont pas cliquables une fois publiés, la réponse se fait en DM.
                  </p>
                )}
              </div>

              {/* Points du modèle « liste » ou « signature » : titre + desc par ligne */}
              {!anime && (tpl === 'signature' || tpl === 'liste') && (
                <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {tpl === 'liste' ? 'Points' : 'Arguments'}{' '}
                    <span className="normal-case text-slate-500">· mets un mot en accent entre [crochets]</span>
                  </p>
                  {points.map((pt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={pt.titre || ''} placeholder="La [vitesse] d'un logiciel"
                        onChange={(e) => setPoints(points.map((p, j) => (j === i ? { ...p, titre: e.target.value } : p)))}
                        className="flex-1 min-w-0 rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#5B6CFF]/50"
                      />
                      <input
                        value={pt.desc || ''} placeholder="Contenu prêt à publier."
                        onChange={(e) => setPoints(points.map((p, j) => (j === i ? { ...p, desc: e.target.value } : p)))}
                        className="flex-1 min-w-0 rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-1.5 text-[13px] text-slate-300 focus:outline-none focus:border-[#5B6CFF]/50"
                      />
                    </div>
                  ))}
                  {tpl === 'signature' && (
                    <div>
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ligne d'offre</label>
                      <input
                        value={baseline} onChange={(e) => setBaseline(e.target.value)}
                        placeholder="10x moins cher qu'une agence. [2h par mois]. Maximum."
                        className="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-2.5 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#5B6CFF]/50"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Couleurs */}
              {colors && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Couleurs</p>
                    <button onClick={resetColors} className="text-[11px] text-slate-500 hover:text-white">Réinitialiser</button>
                  </div>
                  <div className="flex gap-3">
                    {[['p', 'Principale'], ['s', 'Secondaire'], ['a', 'Accent']].map(([k, lab]) => (
                      <label key={k} className="flex items-center gap-2 text-[12px] text-slate-400">
                        <input
                          type="color" value={colors[k] || '#000000'}
                          onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                          className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/10"
                        />
                        {lab}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pied : actions */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/10 shrink-0">
          <p className="text-[12px] text-slate-500 font-inter hidden sm:block">
            {coutQuota} {coutQuota > 1 ? 'stories' : 'story'} de ton quota · créée{coutQuota > 1 ? 's' : ''} « à valider », sans toucher au post d'origine.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 h-10 rounded-xl text-sm font-medium text-slate-300 hover:text-white">
              Annuler
            </button>
            <button
              onClick={valider} disabled={!peutCreer}
              data-testid="story-valider"
              className="inline-flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (anime ? <Film className="w-4 h-4" /> : <Check className="w-4 h-4" />)}
              {enSerie ? `Créer les ${nb} stories${anime ? ' animées' : ''}` : (anime ? 'Créer la story animée' : 'Créer la story')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
