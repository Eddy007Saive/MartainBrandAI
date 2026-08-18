import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Handshake, Copy, Check, Clock, XCircle } from 'lucide-react';

import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import affiliationService from '../services/affiliationService';
import { useUser } from '../context/UserContext';

const Carte = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-white/10 bg-[#0f172a] p-4 sm:p-5 ${className}`}>{children}</div>
);

// Les gains sont ventilés par devise : un affilié qui vend sur deux marchés
// touche en euros et en dollars, on n'invente pas de conversion.
const Montants = ({ valeurs, vide }) => {
  const lignes = Object.entries(valeurs || {});
  if (!lignes.length) return <span className="text-slate-500">{vide}</span>;
  return lignes.map(([devise, montant]) => (
    <span key={devise} className="mr-3">
      {montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} {devise === 'EUR' ? '€' : devise}
    </span>
  ));
};

const STATUT_LABEL = {
  en_attente: 'affiliation.statut.enAttente',
  validee: 'affiliation.statut.validee',
  a_facturer: 'affiliation.statut.aFacturer',
  payee: 'affiliation.statut.payee',
  annulee: 'affiliation.statut.annulee',
};

export default function Affiliation() {
  const { t } = useTranslation();
  const { user } = useUser();
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [copie, setCopie] = useState(false);
  const [iban, setIban] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const charger = () => affiliationService.moi()
    .then(setData)
    .catch(() => setData({ affilie: null }))
    .finally(() => setChargement(false));

  useEffect(() => { charger(); }, []);

  const postuler = async () => {
    if (!iban.trim()) return toast.error(t('affiliation.ibanRequis'));
    setEnvoi(true);
    try {
      await affiliationService.demander({
        nom: user?.nom, email: user?.email, iban: iban.trim(),
      });
      toast.success(t('affiliation.demandeEnvoyee'));
      charger();
    } catch {
      toast.error(t('affiliation.erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const copier = () => {
    navigator.clipboard.writeText(data.affilie.lien);
    setCopie(true);
    setTimeout(() => setCopie(false), 1800);
  };

  if (chargement) return <div className="p-6 text-slate-400 font-inter">{t('affiliation.chargement')}</div>;

  const a = data?.affilie;

  // --- pas encore affilié : le pitch et le formulaire
  if (!a) {
    return (
      <div className="max-w-2xl">
        <PageHeader icon={Handshake} title={t('affiliation.titre')} subtitle={t('affiliation.sousTitre')} />
        <Carte className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-950/50 border border-white/5 p-4">
              <div className="text-2xl font-bold text-[#3AFFA3] font-sora">25 %</div>
              <p className="text-[12.5px] text-slate-400 font-inter mt-1">{t('affiliation.pitch.setup')}</p>
            </div>
            <div className="rounded-xl bg-slate-950/50 border border-white/5 p-4">
              <div className="text-2xl font-bold text-[#3AFFA3] font-sora">10 %</div>
              <p className="text-[12.5px] text-slate-400 font-inter mt-1">{t('affiliation.pitch.recurrent')}</p>
            </div>
          </div>
          <p className="text-[13px] text-slate-400 font-inter leading-relaxed">{t('affiliation.pitch.detail')}</p>
          <div>
            <label className="block text-[12px] text-slate-500 font-inter mb-1.5">{t('affiliation.iban')}</label>
            <Input value={iban} onChange={(e) => setIban(e.target.value)}
              placeholder="FR76 3000 1007 9412 3456 7890 185" data-testid="affiliation-iban" />
            <p className="text-[11.5px] text-slate-500 font-inter mt-1.5">{t('affiliation.ibanNote')}</p>
          </div>
          <Button onClick={postuler} disabled={envoi} data-testid="affiliation-postuler"
            className="bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]">
            {envoi ? t('affiliation.envoi') : t('affiliation.postuler')}
          </Button>
        </Carte>
      </div>
    );
  }

  // --- demande déposée, en attente ou refusée
  if (a.statut !== 'actif') {
    const refuse = a.statut === 'refuse';
    return (
      <div className="max-w-2xl">
        <PageHeader icon={Handshake} title={t('affiliation.titre')} />
        <Carte className="flex items-start gap-3">
          {refuse ? <XCircle className="w-5 h-5 text-red-400 mt-0.5" />
                  : <Clock className="w-5 h-5 text-amber-400 mt-0.5" />}
          <div>
            <p className="text-white font-inter text-[14px]">
              {t(refuse ? 'affiliation.refusee' : 'affiliation.enAttente')}
            </p>
            {a.motif && <p className="text-[13px] text-slate-400 font-inter mt-1">{a.motif}</p>}
          </div>
        </Carte>
      </div>
    );
  }

  // --- affilié actif
  return (
    <div className="max-w-4xl">
      <PageHeader icon={Handshake} title={t('affiliation.titre')} subtitle={t('affiliation.sousTitreActif')} />

      <Carte className="mb-4">
        <label className="block text-[12px] text-slate-500 font-inter mb-1.5">{t('affiliation.tonLien')}</label>
        <div className="flex gap-2">
          <Input readOnly value={a.lien} data-testid="affiliation-lien" className="font-mono text-[13px]" />
          <Button onClick={copier} variant="outline" data-testid="affiliation-copier" className="flex-shrink-0">
            {copie ? <Check className="w-4 h-4 text-[#3AFFA3]" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[11.5px] text-slate-500 font-inter mt-2">
          {t('affiliation.tauxRappel', { setup: a.taux_setup, recurrent: a.taux_recurrent })}
        </p>
      </Carte>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { l: t('affiliation.clics'), v: data.clics },
          { l: t('affiliation.filleuls'), v: data.filleuls },
          { l: t('affiliation.gainsEnAttente'), v: <Montants valeurs={data.gains_en_attente} vide="—" /> },
          { l: t('affiliation.gainsPayes'), v: <Montants valeurs={data.gains_payes} vide="—" /> },
        ].map((s) => (
          <Carte key={s.l}>
            <div className="text-[11.5px] text-slate-500 font-inter uppercase tracking-wide">{s.l}</div>
            <div className="text-lg font-bold text-white font-sora mt-1">{s.v}</div>
          </Carte>
        ))}
      </div>

      <Carte>
        <div className="text-[12px] text-slate-500 font-inter uppercase tracking-wide mb-3">
          {t('affiliation.mesCommissions')}
        </div>
        {!data.commissions?.length ? (
          <p className="text-[13px] text-slate-500 font-inter">{t('affiliation.aucuneCommission')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] font-inter">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="pb-2 font-medium">{t('affiliation.col.date')}</th>
                  <th className="pb-2 font-medium">{t('affiliation.col.type')}</th>
                  <th className="pb-2 font-medium text-right">{t('affiliation.col.vente')}</th>
                  <th className="pb-2 font-medium text-right">{t('affiliation.col.commission')}</th>
                  <th className="pb-2 font-medium text-right">{t('affiliation.col.statut')}</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {data.commissions.map((c) => (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="py-2">{(c.created_at || '').slice(0, 10)}</td>
                    <td className="py-2">{t(c.type === 'setup' ? 'affiliation.type.setup' : 'affiliation.type.recurrent')}</td>
                    <td className="py-2 text-right text-slate-500">
                      {(c.base_cents / 100).toFixed(2)} {c.devise === 'EUR' ? '€' : c.devise}
                    </td>
                    <td className="py-2 text-right text-[#3AFFA3] font-semibold">
                      {(c.montant_cents / 100).toFixed(2)} {c.devise === 'EUR' ? '€' : c.devise}
                    </td>
                    <td className="py-2 text-right">{t(STATUT_LABEL[c.statut] || c.statut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </div>
  );
}
