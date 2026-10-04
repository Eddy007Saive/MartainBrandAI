import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Loader2, LayoutTemplate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { agentService } from '@/services/agentService';
import { ROLES, ROLES_PAGES, devinerRoles, pagesPourServeur } from '@/lib/modeleCarrousel';

// Fenêtre de l'éditeur (au-dessus de lui, d'où l'overlay maison plutôt que le Dialog en portail) :
// nom du modèle + rôle de chaque texte des trois slides.
export default function DialogueModeleCarrousel({ pages, marque, apparence, modele, onClose, onCree }) {
  const { t } = useTranslation();
  const [nom, setNom] = useState(modele?.label || '');
  // Rôles : ceux déjà enregistrés (modification d'un modèle), sinon devinés.
  const [roles, setRoles] = useState(() => {
    const devines = devinerRoles(pages, marque?.nom || marque?.username);
    pages.forEach((p) => p.elements.forEach((e) => { if (e.type === 'texte' && e.role) devines[e.id] = e.role; }));
    return devines;
  });
  const [envoi, setEnvoi] = useState(false);

  const manque = useMemo(() => {
    const de = (i) => pages[i].elements.filter((e) => e.type === 'texte').map((e) => roles[e.id]);
    if (!de(0).includes('accroche')) return t('modeleCarrousel.manqueAccroche');
    if (!de(1).includes('titre')) return t('modeleCarrousel.manqueTitre');
    return null;
  }, [pages, roles, t]);

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      const envoi = pagesPourServeur(pages, roles, { marque, apparence });
      const res = modele
        ? await agentService.modifierModeleCarrousel(modele.id, nom.trim(), envoi)
        : await agentService.creerModeleCarrousel(nom.trim(), envoi);
      toast.success(t(modele ? 'modeleCarrousel.modifie' : 'modeleCarrousel.cree', { nom: res.label }));
      onCree?.(res);
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('modeleCarrousel.echec'));
    } finally { setEnvoi(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-3 sm:p-6" data-testid="dialogue-modele-carrousel">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl">
        <div className="flex items-start gap-3 border-b border-white/[0.08] p-4">
          <LayoutTemplate className="mt-0.5 h-5 w-5 shrink-0 text-[#a5b0ff]" />
          <div className="mr-auto">
            <p className="font-sora text-sm font-semibold text-white">{t(modele ? 'modeleCarrousel.titreModifier' : 'modeleCarrousel.titre')}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{t('modeleCarrousel.intro')}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label={t('editeurCarrousel.fermer')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4">
          <label className="block space-y-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">{t('modeleCarrousel.nom')}</span>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} placeholder={t('modeleCarrousel.nomExemple')}
              className="border-white/10 bg-slate-950/60 text-slate-100" data-testid="modele-nom" />
          </label>

          {pages.map((page, i) => {
            const textes = page.elements.filter((e) => e.type === 'texte' && e.text.trim());
            return (
              <section key={page.id || i} className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">{t(`modeleCarrousel.page.${ROLES_PAGES[i]}`)}</p>
                {textes.length === 0 && <p className="text-xs text-slate-500">{t('modeleCarrousel.aucunTexte')}</p>}
                {textes.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-slate-200" title={e.text}>{e.text.trim()}</p>
                    <select value={roles[e.id] || 'fixe'} onChange={(ev) => setRoles((r) => ({ ...r, [e.id]: ev.target.value }))}
                      className="h-8 shrink-0 rounded-md border border-white/10 bg-slate-950/60 px-2 text-xs text-slate-100"
                      data-testid={`modele-role-${e.id}`} aria-label={t('modeleCarrousel.roleDe', { texte: e.text.trim().slice(0, 40) })}>
                      {ROLES[ROLES_PAGES[i]].map((r) => <option key={r} value={r}>{t(`modeleCarrousel.role.${r}`)}</option>)}
                    </select>
                  </div>
                ))}
              </section>
            );
          })}
          <p className="text-[11px] leading-snug text-slate-500">{t('modeleCarrousel.aide')}</p>
        </div>

        <div className="flex items-center gap-3 border-t border-white/[0.08] p-4">
          <p className="mr-auto text-xs text-amber-300/90">{manque}</p>
          <Button size="sm" variant="ghost" onClick={onClose} className="text-slate-300">{t('modeleCarrousel.annuler')}</Button>
          <Button size="sm" onClick={enregistrer} disabled={envoi || !!manque || !nom.trim()} data-testid="modele-enregistrer"
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white">
            {envoi ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{t('modeleCarrousel.envoi')}</> : t(modele ? 'modeleCarrousel.enregistrerModele' : 'modeleCarrousel.enregistrer')}
          </Button>
        </div>
      </div>
    </div>
  );
}
