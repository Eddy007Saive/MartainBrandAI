import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { contenuService } from '@/services/contenuService';
import { SOCIAL_PLATFORMS } from '@/constants/platforms';

/**
 * Le compte d'un réseau a changé (autre compte, profil recréé, reconnexion après une
 * déconnexion) : les posts pas encore publiés étaient programmés sur l'ANCIEN compte.
 * On demande au client lesquels reprogrammer sur le nouveau — rien ne part sans son accord.
 * Date à venir : gardée. Date passée : prochain créneau libre.
 *
 * `declencheur` : changer sa valeur relance la vérification (fermeture du popup OAuth).
 */
export default function ReprogrammationReseau({ declencheur }) {
  const { t, i18n } = useTranslation();
  const [file, setFile] = useState([]);          // [{ plateforme, posts }]
  const [coches, setCoches] = useState({});      // id -> bool
  const [envoi, setEnvoi] = useState(false);

  const verifier = useCallback(() => {
    contenuService.aReprogrammer()
      .then((d) => {
        const liste = Object.entries(d || {}).map(([plateforme, posts]) => ({ plateforme, posts }));
        setFile(liste);
        if (liste[0]) setCoches(Object.fromEntries(liste[0].posts.map((p) => [p.id, true])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { verifier(); }, [verifier, declencheur]);

  const courant = file[0];
  if (!courant) return null;
  const nomReseau = SOCIAL_PLATFORMS.find((p) => p.id === courant.plateforme)?.name || courant.plateforme;
  const choisis = courant.posts.filter((p) => coches[p.id]).map((p) => p.id);
  const tous = choisis.length === courant.posts.length;

  const repondre = async (ids) => {
    setEnvoi(true);
    try {
      const r = await contenuService.reprogrammer(courant.plateforme, ids);
      if (ids.length) toast.success(t('params.reprog.toastOk', { count: r?.reprogrammes ?? 0 }));
      else toast(t('params.reprog.toastNon'));
    } catch (e) {
      toast.error(e.response?.data?.detail || t('params.reprog.erreur'));
    } finally {
      setEnvoi(false);
      const reste = file.slice(1);
      setFile(reste);
      if (reste[0]) setCoches(Object.fromEntries(reste[0].posts.map((p) => [p.id, true])));
    }
  };

  const dateFr = (iso) => new Date(iso).toLocaleString(i18n.language || 'fr', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    // Fermer (croix, Échap) = « plus tard » : la question reviendra à la prochaine visite.
    <Dialog open onOpenChange={(o) => { if (!o && !envoi) setFile((f) => f.slice(1)); }}>
      <DialogContent className="sm:max-w-lg bg-[#0f172a] border-white/10 text-slate-100" data-testid="reprog-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-outfit">
            <CalendarClock className="w-5 h-5 text-[#8A6CFF]" />
            {t('params.reprog.titre', { reseau: nomReseau })}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {t('params.reprog.desc', { count: courant.posts.length })}
          </DialogDescription>
        </DialogHeader>

        <button type="button" className="justify-self-start w-fit rounded text-xs text-slate-400 hover:text-white underline-offset-2 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-[#8A6CFF]"
          onClick={() => setCoches(Object.fromEntries(courant.posts.map((p) => [p.id, !tous])))}>
          {tous ? t('params.reprog.toutDecocher') : t('params.reprog.toutCocher')}
        </button>

        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
          {courant.posts.map((p) => (
            <label key={p.id} className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 cursor-pointer hover:bg-white/[0.04]">
              <Checkbox checked={!!coches[p.id]} onCheckedChange={(v) => setCoches((c) => ({ ...c, [p.id]: !!v }))}
                className="mt-0.5" data-testid={`reprog-post-${p.id}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-slate-100 truncate">{p.titre || t('params.reprog.sansTitre')}</span>
                <span className={`block text-xs ${p.en_retard ? 'text-amber-300/90' : 'text-slate-400'}`}>
                  {p.en_retard
                    ? t('params.reprog.enRetard', { date: dateFr(p.date_publication) })
                    : t('params.reprog.dateGardee', { date: dateFr(p.date_publication) })}
                </span>
              </span>
            </label>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" disabled={envoi} onClick={() => repondre([])} data-testid="reprog-non">
            {t('params.reprog.non')}
          </Button>
          <Button disabled={envoi || !choisis.length} onClick={() => repondre(choisis)} data-testid="reprog-oui"
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white">
            {envoi && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('params.reprog.oui', { count: choisis.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
