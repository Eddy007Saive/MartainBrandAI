import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, Play, Type, Music, Film, Image as ImageIcon, Video } from 'lucide-react';
import { contenuService } from '../../services/contenuService';
import { STYLES_TEXTE } from '../../generated/montage/schema.js';
import { dureeMedia, estClip } from './outils';

/**
 * Panneau de gauche : tout ce qu'on peut poser sur la timeline. Un clic ajoute l'élément à la
 * tête de lecture (la page se charge de la piste et du chevauchement).
 */
const ONGLETS = ['medias', 'videos', 'musique', 'texte'];

export default function PanneauMedias({ medias, setMedias, onAjouter, t }) {
  const [onglet, setOnglet] = useState('medias');
  const [envoi, setEnvoi] = useState(false);
  const [occupe, setOccupe] = useState(null);
  const [categorie, setCategorie] = useState('');
  const fichier = useRef(null);

  const ajouterVisuel = async (url, apercu, type) => {
    setOccupe(url);
    try {
      if (type === 'video' || estClip(url)) {
        const d = await dureeMedia(url, 'video');
        onAjouter('video', { src: url, duree: d ? Math.round(d * 100) / 100 : 5, apercu_url: apercu || null });
      } else {
        onAjouter('image', { src: url, duree: 4 });
      }
    } finally { setOccupe(null); }
  };

  const ajouterMusique = async (m) => {
    if (!m.url) return;
    setOccupe(m.id);
    try {
      const d = await dureeMedia(m.url, 'audio');
      onAjouter('audio', { src: m.url, duree: d ? Math.round(d * 100) / 100 : 30, volume: 0.5, fonduSortie: 1.5, nom: m.label });
    } finally { setOccupe(null); }
  };

  // Glisser-déposer vers la timeline : la timeline lit ce paquet et pose l'élément à l'endroit lâché.
  const glisser = (e, donnees) => {
    e.dataTransfer.setData('application/x-postorico-media', JSON.stringify(donnees));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const importer = async (files) => {
    if (!files?.length) return;
    setEnvoi(true);
    try {
      for (const f of Array.from(files)) {
        const a = await contenuService.reelBanqueAjouter(f);   // entre dans la banque du compte (conservée)
        setMedias((m) => ({ ...m, banque: [a, ...(m?.banque || [])] }));
        await ajouterVisuel(a.url, a.apercu_url, a.type);
      }
      toast.success(t('editeur.medias.importe'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('editeur.medias.importEchec'));
    } finally { setEnvoi(false); }
  };

  const banque = medias?.banque || [];
  const videos = medias?.videos || [];
  const musiques = (medias?.musiques || []).filter((m) => !categorie || m.category === categorie);
  const cats = medias?.categories || [];

  return (
    <div className="flex flex-col h-full" data-testid="editeur-medias">
      <div className="flex border-b border-white/[0.08]">
        {ONGLETS.map((o) => (
          <button key={o} type="button" onClick={() => setOnglet(o)} data-testid={`medias-onglet-${o}`}
            className={`flex-1 py-2.5 text-[11.5px] font-inter font-semibold uppercase tracking-wide border-b-2 transition-colors ${onglet === o ? 'border-[#3AFFA3] text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t(`editeur.medias.${o}`)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {onglet === 'medias' && (
          <>
            <input ref={fichier} type="file" accept="image/*,video/mp4,video/quicktime,.mp4,.mov" multiple className="hidden"
              onChange={(e) => { importer(e.target.files); e.target.value = ''; }} />
            <button type="button" onClick={() => fichier.current?.click()} disabled={envoi} data-testid="medias-importer"
              className="w-full h-10 mb-3 flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-[#5B6CFF]/50 text-[#a5b0ff] text-[13px] font-inter font-semibold hover:bg-[#5B6CFF]/10 disabled:opacity-50">
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {envoi ? t('editeur.medias.envoi') : t('editeur.medias.importer')}
            </button>
            <p className="text-[11.5px] text-slate-500 font-inter leading-snug mb-2" data-testid="medias-aide">{t('editeur.medias.aideAjout')}</p>
            {banque.length === 0 ? (
              <p className="text-[12px] text-slate-500 font-inter leading-snug">{t('editeur.medias.banqueVide')}</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {banque.map((a) => {
                  const clip = a.type === 'video' || estClip(a.url);
                  return (
                    <button key={a.id} type="button" onClick={() => ajouterVisuel(a.url, a.apercu_url, a.type)} disabled={occupe === a.url}
                      draggable onDragStart={(e) => glisser(e, { type: clip ? 'video' : 'image', url: a.url, apercu: a.apercu_url })}
                      title={a.description || ''} data-testid={`medias-banque-${a.id}`}
                      className="relative aspect-[9/16] rounded-md overflow-hidden border border-white/10 hover:border-[#3AFFA3]/70 group">
                      <img src={a.apercu_url || a.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {clip && <span className="absolute top-1 left-1 text-[9px] font-bold px-1 rounded bg-black/75 text-white">▶</span>}
                      {occupe === a.url && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="w-4 h-4 animate-spin text-white" /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {onglet === 'videos' && (
          videos.length === 0 ? <p className="text-[12px] text-slate-500 font-inter">{t('editeur.medias.videosVide')}</p> : (
            <div className="space-y-1.5">
              {videos.map((v) => (
                <button key={v.id} type="button" onClick={() => ajouterVisuel(v.url, v.apercu_url, 'video')} disabled={occupe === v.url}
                  draggable onDragStart={(e) => glisser(e, { type: 'video', url: v.url, apercu: v.apercu_url })}
                  data-testid={`medias-video-${v.id}`}
                  className="w-full flex items-center gap-2.5 p-1.5 rounded-lg border border-white/[0.06] hover:border-[#3AFFA3]/60 hover:bg-white/[0.03] text-left">
                  <div className="w-9 h-14 rounded bg-black overflow-hidden shrink-0 grid place-items-center">
                    {v.apercu_url ? <img src={v.apercu_url} alt="" className="w-full h-full object-cover" /> : <Video className="w-4 h-4 text-slate-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-slate-200 font-inter truncate">{v.titre || v.type}</div>
                    <div className="text-[10.5px] text-slate-500 font-inter">{v.type}</div>
                  </div>
                  {occupe === v.url ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : <Play className="w-4 h-4 text-slate-500" />}
                </button>
              ))}
            </div>
          )
        )}

        {onglet === 'musique' && (
          <>
            {cats.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                <button type="button" onClick={() => setCategorie('')} className={`text-[11px] px-2 py-1 rounded-full border ${!categorie ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-400'}`}>{t('editeur.medias.toutes')}</button>
                {cats.map((c) => (
                  <button key={c.id || c} type="button" onClick={() => setCategorie(c.id || c)}
                    className={`text-[11px] px-2 py-1 rounded-full border ${categorie === (c.id || c) ? 'border-[#3AFFA3] text-[#3AFFA3]' : 'border-white/10 text-slate-400'}`}>{c.label || c}</button>
                ))}
              </div>
            )}
            <div className="space-y-1">
              {musiques.map((m) => (
                <button key={m.id} type="button" onClick={() => ajouterMusique(m)} disabled={occupe === m.id} data-testid={`medias-musique-${m.id}`}
                  draggable onDragStart={(e) => glisser(e, { type: 'audio', url: m.url, nom: m.label })}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-white/[0.06] hover:border-[#3AFFA3]/60 hover:bg-white/[0.03] text-left">
                  <Music className="w-4 h-4 text-[#3AFFA3] shrink-0" />
                  <span className="text-[12.5px] text-slate-200 font-inter truncate flex-1">{m.label}</span>
                  {occupe === m.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                </button>
              ))}
              {musiques.length === 0 && <p className="text-[12px] text-slate-500 font-inter">{t('editeur.medias.musiqueVide')}</p>}
            </div>
          </>
        )}

        {onglet === 'texte' && (
          <div className="space-y-2">
            <p className="text-[12px] text-slate-500 font-inter leading-snug mb-2">{t('editeur.medias.texteAide')}</p>
            {Object.entries(STYLES_TEXTE).map(([id, st]) => (
              <button key={id} type="button" onClick={() => onAjouter('texte', { texte: t(`editeur.stylesTexte.${id}`), style: { ...st }, duree: 3 })}
                data-testid={`medias-texte-${id}`}
                className="w-full rounded-lg border border-white/[0.06] hover:border-[#8A6CFF]/70 bg-[#0c111f] px-3 py-3 text-left">
                <span style={{
                  fontFamily: st.police === 'Inter' ? 'Inter, sans-serif' : 'Sora, sans-serif', fontWeight: st.gras ? 800 : 500,
                  fontStyle: st.italique ? 'italic' : 'normal', color: st.couleur, background: st.fond, borderRadius: st.rayon / 4,
                  padding: st.marge ? '2px 8px' : 0, fontSize: Math.max(13, st.taille / 4.2), textShadow: st.ombre ? '0 2px 8px rgba(0,0,0,.6)' : 'none',
                }}>{t(`editeur.stylesTexte.${id}`)}</span>
              </button>
            ))}
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-inter pt-2"><Type className="w-3.5 h-3.5" /> <ImageIcon className="w-3.5 h-3.5" /> <Film className="w-3.5 h-3.5" /> {t('editeur.medias.raccourcis')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
