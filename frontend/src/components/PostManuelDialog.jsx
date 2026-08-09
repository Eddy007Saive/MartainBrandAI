import { useState, useRef } from 'react';
import { Loader2, ImagePlus, X, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { SocialIcon } from './SocialIcon';
import { SOCIAL_PLATFORMS } from '../constants/platforms';
import { agentService } from '../services/agentService';
import { contenuService } from '../services/contenuService';

// Limites de caractères par réseau (mêmes valeurs que l'éditeur de ContenusPage)
const LIMITES = { instagram: 2200, tiktok: 2200, googlebusiness: 1500, twitter: 280, linkedin: 3000, facebook: 63000, youtube: 5000 };
const STORY_OK = ['instagram', 'facebook'];

/**
 * Création d'un post 100 % manuel : le client écrit son texte, choisit le réseau et
 * importe son propre visuel. Aucune génération IA, aucun quota consommé
 * (route /agent/enregistrer + upload direct du visuel).
 */
export default function PostManuelDialog({ open, onOpenChange, onCreated }) {
  const { t } = useTranslation();
  const [texte, setTexte] = useState('');
  const [reseau, setReseau] = useState('linkedin');
  const [story, setStory] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const limite = LIMITES[reseau];
  const trop = limite && texte.length > limite;
  const storyDispo = STORY_OK.includes(reseau);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setTexte(''); setReseau('linkedin'); setStory(false); setFile(null); setPreview(null);
  };

  const close = (v) => { if (!v) reset(); onOpenChange(v); };

  const choisirImage = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error(t('manuel.imageType')); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error(t('manuel.imageTropLourde')); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const retirerImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const enregistrer = async () => {
    const contenu = texte.trim();
    if (!contenu) { toast.error(t('manuel.texteRequis')); return; }
    if (trop) { toast.error(t('manuel.tropLong', { limite })); return; }
    setSaving(true);
    try {
      const titre = contenu.split('\n')[0].slice(0, 80);
      const d = await agentService.enregistrer(contenu, titre, reseau, story && storyDispo ? 'Story' : null);
      // Le visuel s'importe après coup : il a besoin de l'id du contenu créé.
      if (file && d?.contenu_id) {
        try {
          await contenuService.uploadImage(d.contenu_id, file);
        } catch {
          toast.warning(t('manuel.imageEchouee'));
        }
      }
      toast.success(t('manuel.cree'));
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || t('manuel.erreur'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-[#0f172a] border-white/10 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white font-sora flex items-center gap-2">
            <PenLine className="w-4 h-4 text-[#8A6CFF]" />
            {t('manuel.titre')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-inter -mt-1">{t('manuel.sousTitre')}</p>

          {/* Réseau */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1.5">{t('manuel.reseau')}</p>
            <div className="flex gap-2 flex-wrap">
              {SOCIAL_PLATFORMS.map((p) => (
                <button key={p.id} type="button"
                  onClick={() => { setReseau(p.id); if (!STORY_OK.includes(p.id)) setStory(false); }}
                  data-testid={`manuel-reseau-${p.id}`}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[12.5px] transition-colors ${
                    reseau === p.id
                      ? 'border-[#3AFFA3] text-[#3AFFA3] bg-[#3AFFA3]/[0.07]'
                      : 'border-white/[0.07] text-slate-400 hover:text-white hover:border-white/20'}`}>
                  <SocialIcon network={p.id} className="w-3.5 h-3.5" />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Story 24 h — Instagram / Facebook seulement */}
          {storyDispo && (
            <label className="flex items-center gap-2 text-[12.5px] text-slate-400 cursor-pointer">
              <input type="checkbox" checked={story} onChange={(e) => setStory(e.target.checked)}
                className="accent-[#8A6CFF]" data-testid="manuel-story" />
              {t('manuel.story')}
            </label>
          )}

          {/* Texte */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter">{t('manuel.texte')}</p>
              {limite && (
                <span className={`text-[11px] font-inter ${trop ? 'text-red-400' : 'text-slate-600'}`}>
                  {texte.length} / {limite}
                </span>
              )}
            </div>
            <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={9}
              placeholder={t('manuel.placeholder')} data-testid="manuel-texte"
              className={`w-full rounded-xl bg-[#0c111f] border text-slate-200 text-[13.5px] leading-relaxed p-3 outline-none resize-y font-inter ${
                trop ? 'border-red-500/50' : 'border-white/10 focus:border-[#5B6CFF]/50'}`} />
          </div>

          {/* Visuel */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-inter mb-1.5">{t('manuel.visuel')}</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => choisirImage(e.target.files?.[0])} data-testid="manuel-image" />
            {!preview ? (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-white/12 text-[12.5px] text-slate-400 hover:border-[#5B6CFF]/40 hover:text-white transition-colors">
                <ImagePlus className="w-4 h-4" /> {t('manuel.ajouterImage')}
              </button>
            ) : (
              <div className="relative inline-block">
                <img src={preview} alt="" className="max-h-40 rounded-xl border border-white/10" />
                <button type="button" onClick={retirerImage} aria-label={t('manuel.retirerImage')}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 border border-white/15 grid place-items-center text-slate-300 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => close(false)} className="text-slate-400">{t('manuel.annuler')}</Button>
          <Button onClick={enregistrer} disabled={saving || !texte.trim() || trop} data-testid="manuel-enregistrer"
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white hover:opacity-90 gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
            {t('manuel.creer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
