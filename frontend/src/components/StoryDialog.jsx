import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Check, RefreshCw, Sparkles, Film } from 'lucide-react';
import { toast } from 'sonner';
import { contenuService } from '../services/contenuService';

/**
 * Décliner un post en story : sélecteur de modèles 9:16 + retouche (texte, CTA,
 * couleurs) avec aperçu live rendu côté serveur. On ne crée le contenu Story
 * qu'à la validation ; le post d'origine n'est jamais modifié.
 */
export default function StoryDialog({ contenu, onClose, onCreated }) {
  const [opts, setOpts] = useState(null); // { parts, modeles, couleurs, a_un_visuel }
  const [tpl, setTpl] = useState(null);
  const [accroche, setAccroche] = useState('');
  const [sous, setSous] = useState('');
  const [cta, setCta] = useState('');
  const [colors, setColors] = useState(null); // { p, s, a }
  const [points, setPoints] = useState([]);    // modèle « signature » : 3 arguments
  const [baseline, setBaseline] = useState(''); // modèle « signature » : ligne d'offre
  const [preview, setPreview] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [animating, setAnimating] = useState(false);
  // Photo à utiliser pour les modèles image (Photo/Photo entière/Photo+bloc) : les
  // slides d'un carrousel si le post en a plusieurs, sinon son unique visuel.
  const [imageSource, setImageSource] = useState(contenu.lien_visuel || null);
  const photosDisponibles = (Array.isArray(contenu.slides_images) && contenu.slides_images.length
    ? contenu.slides_images
    : (contenu.lien_visuel ? [contenu.lien_visuel] : []));

  const corps = useCallback((t) => ({
    template: t, accroche, sous, cta, colors, image_source: imageSource,
    ...(t === 'signature' ? { points, baseline } : {}),
    ...(t === 'liste' ? { points } : {}),
  }), [accroche, sous, cta, colors, imageSource, points, baseline]);

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

  // Chargement initial : texte pré-rempli, modèles, couleurs de marque
  useEffect(() => {
    let alive = true;
    contenuService.storyOptions(contenu.id).then((d) => {
      if (!alive) return;
      setOpts(d);
      setAccroche(d.parts.accroche || '');
      setSous(d.parts.sous || '');
      setCta(d.parts.cta || 'Réponds en DM 👉');
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

  // (Re)rendu quand on change de modèle OU de photo source (choix ponctuel, pas de
  // souci de spam). Le texte courant est capturé volontairement à part : on ne veut
  // pas re-rendre à chaque frappe — d'où l'omission de `rendre` des deps.
  useEffect(() => {
    if (tpl) rendre(tpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl, imageSource]);

  const valider = async () => {
    setSaving(true);
    try {
      const d = await contenuService.storyCreer(contenu.id, { ...corps(tpl), image: preview });
      const dt = d.date_publication
        ? new Date(d.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        : null;
      toast.success(dt ? `Story créée pour le ${dt}, à valider` : 'Story créée, à valider');
      onCreated?.(d);
      onClose();
    } catch (e) {
      setSaving(false);
      toast.error(e.response?.data?.detail || 'La création de la story a échoué.');
    }
  };

  // Version animée (Remotion, ~1-2 min) : réutilise le texte/couleurs déjà édités
  // ici, aucun nouvel appel IA. Premier gabarit animé — indépendant des 11 modèles
  // statiques du sélecteur ci-dessus.
  const creerAnimee = async () => {
    setAnimating(true);
    const toastId = toast.loading("Génération de la version animée… jusqu'à 2 min");
    try {
      const d = await contenuService.storyAnimee(contenu.id, { accroche, sous, cta, colors });
      const dt = d.date_publication
        ? new Date(d.date_publication).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        : null;
      toast.success(dt ? `Story animée créée pour le ${dt}, à valider` : 'Story animée créée, à valider', { id: toastId });
      onCreated?.(d);
      onClose();
    } catch (e) {
      if (!e.__handled) toast.error(e.response?.data?.detail || "La version animée a échoué.", { id: toastId });
      else toast.dismiss(toastId);
    } finally {
      setAnimating(false);
    }
  };

  const resetColors = () => setColors(opts?.couleurs || null);

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
          <div className="flex-1 grid place-items-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#5B6CFF]" />
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
              </div>
              <button
                onClick={() => rendre(tpl)} disabled={rendering}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#3AFFA3] hover:underline disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Mettre à jour l'aperçu
              </button>
            </div>

            {/* Réglages */}
            <div className="p-5 space-y-4">
              {/* Modèles */}
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

              {/* Photo (modèles Photo/Photo entière/Photo+bloc) : choisir parmi les slides existantes */}
              {photosDisponibles.length > 1 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Photo</p>
                  <div className="flex flex-wrap gap-2">
                    {photosDisponibles.map((url, i) => (
                      <button
                        key={url} onClick={() => setImageSource(url)}
                        title={`Slide ${i + 1}`}
                        className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                          imageSource === url ? 'border-[#5B6CFF]' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img src={url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Textes */}
              <div className="space-y-2.5">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Accroche</label>
                  <textarea
                    value={accroche} onChange={(e) => setAccroche(e.target.value)} rows={2}
                    className="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[14px] text-white resize-none focus:outline-none focus:border-[#5B6CFF]/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sous-titre</label>
                  <input
                    value={sous} onChange={(e) => setSous(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[14px] text-white focus:outline-none focus:border-[#5B6CFF]/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bouton (CTA)</label>
                  <input
                    value={cta} onChange={(e) => setCta(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-[14px] text-white focus:outline-none focus:border-[#5B6CFF]/50"
                  />
                </div>
              </div>

              {/* Points du modèle « liste » ou « signature » : titre + desc par ligne */}
              {(tpl === 'signature' || tpl === 'liste') && (
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
            La story sera créée « à valider », sans toucher au post d'origine.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 h-10 rounded-xl text-sm font-medium text-slate-300 hover:text-white">
              Annuler
            </button>
            <button
              onClick={creerAnimee} disabled={saving || animating || rendering || !accroche.trim()}
              title="Rendu vidéo ~1-2 min, gabarit unique (indépendant du modèle choisi ci-dessus)"
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold text-white bg-white/[0.06] border border-white/10 hover:border-white/25 transition-colors disabled:opacity-50"
            >
              {animating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
              Version animée
            </button>
            <button
              onClick={valider} disabled={saving || animating || rendering || !preview}
              data-testid="story-valider"
              className="inline-flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Créer la story
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
