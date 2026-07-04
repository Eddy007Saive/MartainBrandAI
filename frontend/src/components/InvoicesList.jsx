import { useState, useEffect } from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { billingService } from '../services/billingService';

const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};
const STATUS = {
  paid: { label: 'Payée', cls: 'text-[#3AFFA3]' },
  open: { label: 'À payer', cls: 'text-amber-400' },
  void: { label: 'Annulée', cls: 'text-slate-500' },
  uncollectible: { label: 'Impayée', cls: 'text-red-400' },
};

// Liste des factures Stripe du compte (affichée sous l'abonnement).
export default function InvoicesList() {
  const [inv, setInv] = useState(null); // null = chargement

  useEffect(() => {
    billingService.invoices().then((d) => setInv(d.invoices || [])).catch(() => setInv([]));
  }, []);

  if (inv === null) return null;   // discret pendant le chargement
  if (!inv.length) return null;    // aucune facture -> on n'affiche rien

  return (
    <div className="max-w-md mt-6">
      <div className="text-xs text-slate-400 mb-2 font-inter uppercase tracking-wide">Factures</div>
      <div className="rounded-xl border border-white/[0.06] bg-[#0f172a] divide-y divide-white/[0.05]">
        {inv.map((f, i) => {
          const st = STATUS[f.status] || { label: f.status, cls: 'text-slate-400' };
          return (
            <div key={f.number || i} className="flex items-center gap-3 px-4 py-3">
              <FileText className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-slate-200 font-inter">{fmtDate(f.date)}</div>
                <div className="text-[11px] text-slate-500 font-inter">{f.number || '—'}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[13px] font-semibold text-white tabular-nums">{Number(f.amount).toFixed(2)} {f.currency}</div>
                <div className={`text-[11px] font-medium ${st.cls}`}>{st.label}</div>
              </div>
              {(f.pdf || f.url) && (
                <a href={f.pdf || f.url} target="_blank" rel="noopener noreferrer"
                  title="Télécharger la facture (PDF)"
                  className="shrink-0 w-8 h-8 grid place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
