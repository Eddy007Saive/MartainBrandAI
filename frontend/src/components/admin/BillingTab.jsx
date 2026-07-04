import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ExternalLink, FileText, Search } from 'lucide-react';
import { adminService } from '../../services/adminService';

// Libellé + couleur par statut Stripe
const STATUS = {
  paid:          { label: 'Payée',       cls: 'bg-[#3AFFA3]/12 text-[#3AFFA3] border-[#3AFFA3]/25' },
  open:          { label: 'En attente',  cls: 'bg-amber-500/12 text-amber-400 border-amber-500/25' },
  void:          { label: 'Annulée',     cls: 'bg-slate-500/12 text-slate-400 border-slate-500/25' },
  uncollectible: { label: 'Irrécouvrable', cls: 'bg-red-500/12 text-red-400 border-red-500/25' },
  draft:         { label: 'Brouillon',   cls: 'bg-slate-500/12 text-slate-400 border-slate-500/25' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
};

export default function BillingTab() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    adminService.getInvoices()
      .then((d) => setInvoices(d.invoices || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = invoices.filter((i) =>
    !q ||
    i.client?.toLowerCase().includes(q.toLowerCase()) ||
    i.email?.toLowerCase().includes(q.toLowerCase()) ||
    i.number?.toLowerCase().includes(q.toLowerCase())
  );

  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((a, i) => a + (i.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold font-sora text-white">Facturation</h2>
          <p className="text-sm text-slate-400 font-inter mt-1">
            Toutes les factures Stripe des clients · {invoices.length} facture{invoices.length > 1 ? 's' : ''}
            {totalPaid > 0 && <> · <span className="text-[#3AFFA3] font-medium">{totalPaid.toFixed(0)} € encaissés</span></>}
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/[0.06] text-sm transition-colors">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un client, email, n° de facture…"
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-900/60 border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#5B6CFF]/50"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[#5B6CFF]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <FileText className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">{invoices.length === 0 ? 'Aucune facture pour le moment.' : 'Aucun résultat.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#0f172a]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-white/[0.06]">
                <th className="px-4 py-3 font-medium font-inter">Client</th>
                <th className="px-4 py-3 font-medium font-inter">N°</th>
                <th className="px-4 py-3 font-medium font-inter">Date</th>
                <th className="px-4 py-3 font-medium font-inter text-right">Montant</th>
                <th className="px-4 py-3 font-medium font-inter">Statut</th>
                <th className="px-4 py-3 font-medium font-inter text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i, idx) => {
                const st = STATUS[i.status] || { label: i.status || '—', cls: 'bg-slate-500/12 text-slate-400 border-slate-500/25' };
                return (
                  <tr key={i.number || idx} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{i.client || '—'}</div>
                      {i.email && <div className="text-[12px] text-slate-500">{i.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-[12px]">{i.number || '—'}</td>
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{fmtDate(i.date)}</td>
                    <td className="px-4 py-3 text-right text-white font-semibold whitespace-nowrap tabular-nums">
                      {(i.amount || 0).toFixed(2)} {i.currency === 'EUR' ? '€' : i.currency}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {i.pdf || i.url ? (
                        <a href={i.pdf || i.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#8A6CFF] hover:underline text-[13px]">
                          Voir <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
