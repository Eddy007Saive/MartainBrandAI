import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, X, Eye, Banknote, RefreshCw } from 'lucide-react';

import { Button } from '../ui/button';
import affiliationService from '../../services/affiliationService';
import { billingService } from '../../services/billingService';

// Lien de paiement du Pack Fondations, généré après le rendez-vous. Le code de
// l'apporteur y est déposé : c'est ce qui déclenche les 25 %. La devise suit le
// marché — dollar pour l'hispanophone (Colombie), euro sinon.
function LienPack({ affilies }) {
  const [email, setEmail] = useState('');
  const [affilie, setAffilie] = useState('');
  const [devise, setDevise] = useState('eur');
  const [lien, setLien] = useState('');
  const [occupe, setOccupe] = useState(false);

  const generer = async () => {
    if (!email.trim()) return toast.error('Email du client requis');
    setOccupe(true);
    try {
      const r = await billingService.lienPack({ email: email.trim(), affilie: affilie || undefined, devise });
      setLien(r.url);
      navigator.clipboard.writeText(r.url);
      toast.success(`Lien ${r.devise} copié`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Génération impossible');
    } finally {
      setOccupe(false);
    }
  };

  const champ = 'bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-1.5 outline-none focus:border-[#5B6CFF]/50';
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-5">
      <h3 className="text-[15px] font-bold text-white font-sora mb-1">Lien de paiement — Pack Fondations</h3>
      <p className="text-[12.5px] text-slate-500 font-inter mb-4">
        À envoyer après le rendez-vous. 1 499 € en euro, 699 $ pour le marché hispanophone.
      </p>
      <div className="flex flex-wrap gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email du client"
          data-testid="pack-email" className={`${champ} flex-1 min-w-[200px]`} />
        <select value={affilie} onChange={(e) => setAffilie(e.target.value)} data-testid="pack-affilie" className={champ}>
          <option value="">Sans apporteur</option>
          {affilies.filter((a) => a.statut === 'actif').map((a) => (
            <option key={a.id} value={a.code}>{a.nom} · {a.code}</option>
          ))}
        </select>
        <select value={devise} onChange={(e) => setDevise(e.target.value)} data-testid="pack-devise" className={champ}>
          <option value="eur">EUR · 1 499 €</option>
          <option value="usd">USD · 699 $</option>
        </select>
        <Button onClick={generer} disabled={occupe} data-testid="pack-generer"
          className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]">
          {occupe ? 'Génération…' : 'Générer'}
        </Button>
      </div>
      {lien && (
        <p className="text-[12px] text-slate-400 font-mono mt-3 break-all">
          {lien} <span className="text-slate-600 font-inter">— copié, valable 24 h</span>
        </p>
      )}
    </div>
  );
}

// Back-office de l'affiliation : les demandes à valider, puis le mois par mois
// — qui a vendu, pour combien, et où en est le paiement.

const moisCourant = () => new Date().toISOString().slice(0, 7);

const euros = (cents, devise) =>
  `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ${devise === 'EUR' ? '€' : devise}`;

const Carte = ({ titre, children, actions }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0f172a] p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-[15px] font-bold text-white font-sora">{titre}</h3>
      {actions}
    </div>
    {children}
  </div>
);

const Badge = ({ statut }) => {
  const couleurs = {
    en_attente: 'bg-amber-500/15 text-amber-300', validee: 'bg-blue-500/15 text-blue-300',
    a_facturer: 'bg-violet-500/15 text-violet-300', payee: 'bg-emerald-500/15 text-emerald-300',
    annulee: 'bg-slate-500/15 text-slate-400', actif: 'bg-emerald-500/15 text-emerald-300',
    refuse: 'bg-red-500/15 text-red-300', suspendu: 'bg-red-500/15 text-red-300',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${couleurs[statut] || 'bg-slate-500/15 text-slate-400'}`}>
      {statut.replace('_', ' ')}
    </span>
  );
};

export default function AffiliationTab() {
  const [periode, setPeriode] = useState(moisCourant());
  const [affilies, setAffilies] = useState([]);
  const [resume, setResume] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [releves, setReleves] = useState([]);
  const [occupe, setOccupe] = useState(false);

  const charger = () => {
    setOccupe(true);
    Promise.all([
      affiliationService.affilies(),
      affiliationService.resume(periode),
      affiliationService.commissions({ periode }),
      affiliationService.releves(periode),
    ]).then(([a, r, c, s]) => {
      setAffilies(a || []); setResume(r || []); setCommissions(c || []); setReleves(s || []);
    }).catch(() => toast.error('Chargement impossible'))
      .finally(() => setOccupe(false));
  };

  useEffect(charger, [periode]);

  const decider = async (id, statut) => {
    const motif = statut === 'refuse' ? window.prompt('Motif du refus (facultatif) :') : null;
    if (statut === 'refuse' && motif === null) return;
    await affiliationService.decider(id, { statut, motif });
    toast.success(statut === 'actif' ? 'Affilié activé' : 'Demande traitée');
    charger();
  };

  const voirIban = async (id) => {
    const { iban } = await affiliationService.iban(id);
    if (iban) window.prompt('IBAN (lecture tracée) :', iban);
    else toast.error('Aucun IBAN enregistré');
  };

  const cloturer = async () => {
    if (!window.confirm(`Clôturer ${periode} ? Les commissions validées passent « à facturer » et chaque affilié reçoit son relevé par email.`)) return;
    const r = await affiliationService.traitementMensuel(periode);
    toast.success(`${r.releves} relevé(s) envoyé(s)`);
    charger();
  };

  const enAttente = affilies.filter((a) => a.statut === 'en_attente');
  const aValider = commissions.filter((c) => c.statut === 'en_attente');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold font-sora text-white">Affiliation</h2>
        <div className="flex items-center gap-2">
          <input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)}
            data-testid="affiliation-periode"
            className="bg-slate-950/60 border border-white/10 text-slate-200 text-[13px] rounded-lg px-3 py-1.5 outline-none focus:border-[#5B6CFF]/50" />
          <Button variant="ghost" onClick={charger} disabled={occupe} className="text-slate-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${occupe ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <LienPack affilies={affilies} />

      {/* Demandes à traiter */}
      {enAttente.length > 0 && (
        <Carte titre={`Demandes en attente (${enAttente.length})`}>
          <div className="space-y-2">
            {enAttente.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/50 border border-white/5 p-3">
                <div className="min-w-0">
                  <div className="text-[14px] text-white font-inter truncate">
                    {a.nom} <span className="text-slate-500">· {a.email}</span>
                  </div>
                  <div className="text-[12px] text-slate-500 font-inter">
                    {a.code} · {a.telegram_id ? 'client' : 'externe'}
                    {a.audience ? ` · ${a.audience}` : ''} · IBAN {a.iban || '—'}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button size="sm" onClick={() => decider(a.id, 'actif')} data-testid={`affiliation-valider-${a.code}`}
                    className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decider(a.id, 'refuse')}
                    className="text-red-300 hover:bg-red-500/15">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Carte>
      )}

      {/* Qui a vendu ce mois-ci */}
      <Carte titre={`Ventes de ${periode}`}
        actions={<Button size="sm" onClick={cloturer} disabled={!commissions.some((c) => c.statut === 'validee')}
          className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]" data-testid="affiliation-cloturer">
          Clôturer le mois
        </Button>}>
        {!resume.length ? (
          <p className="text-[13px] text-slate-500 font-inter">Aucune vente commissionnée sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] font-inter">
              <thead><tr className="text-slate-500 text-left">
                <th className="pb-2 font-medium">Affilié</th>
                <th className="pb-2 font-medium text-right">Packs</th>
                <th className="pb-2 font-medium text-right">Abos</th>
                <th className="pb-2 font-medium text-right">CA apporté</th>
                <th className="pb-2 font-medium text-right">Commission</th>
              </tr></thead>
              <tbody className="text-slate-300">
                {resume.map((r) => (
                  <tr key={r.affilie_code + r.devise} className="border-t border-white/5">
                    <td className="py-2">{r.affilie_nom} <span className="text-slate-500">{r.affilie_code}</span></td>
                    <td className="py-2 text-right">{r.setup || 0}</td>
                    <td className="py-2 text-right">{r.recurrent || 0}</td>
                    <td className="py-2 text-right text-slate-400">{r.ca.toFixed(2)} {r.devise === 'EUR' ? '€' : r.devise}</td>
                    <td className="py-2 text-right text-[#3AFFA3] font-semibold">{r.montant.toFixed(2)} {r.devise === 'EUR' ? '€' : r.devise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {/* Commissions à valider une par une */}
      <Carte titre={`Commissions (${commissions.length})`}>
        {!commissions.length ? (
          <p className="text-[13px] text-slate-500 font-inter">Rien sur cette période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] font-inter">
              <thead><tr className="text-slate-500 text-left">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Affilié</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium text-right">Vente</th>
                <th className="pb-2 font-medium text-right">Commission</th>
                <th className="pb-2 font-medium text-right">Statut</th>
                <th className="pb-2" />
              </tr></thead>
              <tbody className="text-slate-300">
                {commissions.map((c) => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="py-2">{(c.created_at || '').slice(0, 10)}</td>
                    <td className="py-2">{c.affilie_code}</td>
                    <td className="py-2">
                      {c.type === 'setup' ? 'Pack' : 'Abo'}
                      {c.fraude && <span className="ml-1.5 text-amber-400" title="IP partagée avec d'autres filleuls">⚠</span>}
                    </td>
                    <td className="py-2 text-right text-slate-500">{euros(c.base_cents, c.devise)}</td>
                    <td className="py-2 text-right text-[#3AFFA3] font-semibold">{euros(c.montant_cents, c.devise)}</td>
                    <td className="py-2 text-right"><Badge statut={c.statut} /></td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {c.statut === 'en_attente' && (
                        <>
                          <button onClick={() => affiliationService.validerCommission(c.id).then(charger)}
                            className="text-emerald-300 hover:text-emerald-200 px-1.5" title="Valider">
                            <Check className="w-4 h-4 inline" />
                          </button>
                          <button onClick={() => affiliationService.annulerCommission(c.id).then(charger)}
                            className="text-red-300 hover:text-red-200 px-1.5" title="Annuler">
                            <X className="w-4 h-4 inline" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {aValider.length > 1 && (
              <Button size="sm" variant="outline" className="mt-3"
                onClick={async () => {
                  for (const c of aValider) await affiliationService.validerCommission(c.id);
                  toast.success(`${aValider.length} commissions validées`);
                  charger();
                }}>
                Tout valider ({aValider.length})
              </Button>
            )}
          </div>
        )}
      </Carte>

      {/* Relevés : c'est là qu'on récupère l'IBAN pour virer */}
      <Carte titre="Relevés à payer">
        {!releves.length ? (
          <p className="text-[13px] text-slate-500 font-inter">Aucun relevé sur cette période.</p>
        ) : (
          <div className="space-y-2">
            {releves.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-950/50 border border-white/5 p-3">
                <div>
                  <div className="text-[14px] text-white font-inter">
                    {r.affilie_nom} <span className="text-slate-500">· {euros(r.montant_cents, r.devise)} · {r.nb} vente(s)</span>
                  </div>
                  <div className="text-[12px] text-slate-500 font-inter">{r.affilie_email}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge statut={r.statut} />
                  <Button size="sm" variant="ghost" onClick={() => voirIban(r.affiliate_id)} title="Voir l'IBAN">
                    <Eye className="w-4 h-4" />
                  </Button>
                  {r.statut !== 'payee' && (
                    <Button size="sm" onClick={() => affiliationService.payerReleve(r.id).then(() => { toast.success('Marqué payé'); charger(); })}
                      className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">
                      <Banknote className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Carte>
    </div>
  );
}
