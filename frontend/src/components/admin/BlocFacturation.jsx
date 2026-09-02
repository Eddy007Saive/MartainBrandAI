import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, Play, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { adminService } from '../../services/adminService';

/**
 * Le bloc « Facturation » d'une fiche client, dans le back-office.
 *
 * Il sert un geste précis du Parcours 1 : le client a payé son Pack
 * Fondations, sa carte est restée enregistrée, et l'équipe déclenche
 * l'abonnement le jour où le paramétrage est livré — trois semaines plus tard,
 * sans rien lui redemander.
 *
 * Rien n'est stocké chez nous : la carte et l'abonnement sont lus dans Stripe
 * à l'ouverture de la fiche. Une carte peut expirer ou être retirée entre le
 * Pack et le déclenchement, et un état recopié en base mentirait ce jour-là.
 */
const ETIQUETTES = {
  active: ['Abonné', '#3AFFA3'],
  trialing: ['En essai', '#3AFFA3'],
  past_due: ['Impayé', '#f59e0b'],
  incomplete: ['En attente de confirmation', '#f59e0b'],
  canceled: ['Résilié', '#94a3b8'],
};

export default function BlocFacturation({ telegramId }) {
  const [etat, setEtat] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);

  const lire = useCallback(() => {
    setChargement(true);
    return adminService.facturation(telegramId)
      .then(setEtat)
      .catch(() => setEtat({ ok: false, error: 'Lecture Stripe impossible.' }))
      .finally(() => setChargement(false));
  }, [telegramId]);

  useEffect(() => { lire(); }, [lire]);

  const demarrer = async () => {
    // Un prélèvement n'est pas une action qu'on annule : on demande avant.
    const montant = etat?.carte ? `la carte ${etat.carte.marque} ****${etat.carte.fin}` : 'sa carte';
    if (!window.confirm(
      `Démarrer l'abonnement Pro maintenant ?\n\n`
      + `Le premier prélèvement de 279 € part immédiatement sur ${montant}, `
      + `puis tous les mois. Il n'y a pas de période d'essai.`)) return;
    setEnvoi(true);
    try {
      const r = await adminService.demarrerAbonnement(telegramId);
      toast.success(r.status === 'active'
        ? 'Abonnement démarré, premier paiement encaissé.'
        : `Abonnement créé, statut « ${r.status} ».`);
      await lire();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Déclenchement impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  const [libelle, couleur] = ETIQUETTES[etat?.abonnement] || [];
  const dejaAbonne = ['active', 'trialing', 'past_due'].includes(etat?.abonnement);

  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-[#0a1120] p-4"
      data-testid="bloc-facturation">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-300 font-inter">
          <CreditCard className="w-4 h-4 text-slate-500" /> Facturation
        </span>
        <button onClick={lire} disabled={chargement} title="Relire dans Stripe"
          className="text-slate-600 hover:text-slate-300 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {chargement && !etat ? (
        <p className="text-[12.5px] text-slate-600 font-inter">Lecture…</p>
      ) : etat?.ok === false ? (
        // On distingue « pas de carte » de « Stripe injoignable ». Confondre
        // les deux ferait cliquer sur un bouton qui ne peut pas aboutir.
        <p className="text-[12.5px] text-amber-400 font-inter">{etat.error}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-y-2 text-[12.5px] font-inter mb-3.5">
            <dt className="text-slate-600">Carte enregistrée</dt>
            <dd className="text-slate-300 text-right">
              {etat?.carte
                ? <>{etat.carte.marque} ****{etat.carte.fin} <span className="text-slate-600">· {etat.carte.expire}</span></>
                : <span className="text-slate-600">aucune</span>}
            </dd>
            <dt className="text-slate-600">Abonnement</dt>
            <dd className="text-right">
              {libelle
                ? <span style={{ color: couleur }}>{libelle}</span>
                : <span className="text-slate-600">aucun</span>}
            </dd>
          </dl>

          {dejaAbonne ? (
            <p className="text-[12px] text-slate-600 font-inter leading-relaxed">
              Rien à faire : la facturation tourne. La résiliation se fait depuis
              l'espace du client, ou dans Stripe.
            </p>
          ) : etat?.carte ? (
            <button onClick={demarrer} disabled={envoi} data-testid="demarrer-abonnement"
              className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-[11px]
                         text-sm font-medium font-inter text-white
                         bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] active:scale-[0.97]
                         disabled:opacity-60 disabled:active:scale-100
                         transition-transform duration-150 ease-out-strong">
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Démarrer l'abonnement
            </button>
          ) : (
            <p className="text-[12px] text-slate-600 font-inter leading-relaxed">
              Aucune carte à débiter. Ce client n'a pas réglé son Pack par
              Stripe, ou l'a fait avant que les cartes soient conservées.
              Envoie-lui un lien d'abonnement.
            </p>
          )}
        </>
      )}
    </div>
  );
}
