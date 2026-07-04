import { useState, useEffect, useMemo } from 'react';
import { Loader2, RefreshCw, ExternalLink, FileText, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { adminService } from '../../services/adminService';

const PER_PAGE = 6; // clients par page

// Libellé + couleur par statut Stripe
const STATUS = {
  paid:          { label: 'Payée',        cls: 'bg-[#3AFFA3]/12 text-[#3AFFA3] border-[#3AFFA3]/25' },
  open:          { label: 'En attente',   cls: 'bg-amber-500/12 text-amber-400 border-amber-500/25' },
  void:          { label: 'Annulée',      cls: 'bg-slate-500/12 text-slate-400 border-slate-500/25' },
  uncollectible: { label: 'Irrécouvrable', cls: 'bg-red-500/12 text-red-400 border-red-500/25' },
  draft:         { label: 'Brouillon',    cls: 'bg-slate-500/12 text-slate-400 border-slate-500/25' },
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
};
const initials = (name) => (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
const money = (a, cur) => `${(a || 0).toFixed(2)} ${cur === 'EUR' ? '€' : (cur || '')}`.trim();

export default function BillingTab() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(() => new Set()); // groupes dépliés

  const load = () => {
    setLoading(true);
    adminService.getInvoices()
      .then((d) => setInvoices(d.invoices || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Regroupe les factures par client
  const groups = useMemo(() => {
    const map = new Map();
    for (const inv of invoices) {
      const key = inv.telegram_id || inv.email || inv.client || 'inconnu';
      if (!map.has(key)) {
        map.set(key, { key, client: inv.client || '—', email: inv.email || '', invoices: [], total: 0 });
      }
      const g = map.get(key);
      g.invoices.push(inv);
      if (inv.status === 'paid') g.total += inv.amount || 0;
    }
    const arr = [...map.values()].map((g) => {
      g.invoices.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      g.last = g.invoices[0]?.date || null;
      g.first = g.invoices[g.invoices.length - 1]?.date || null;
      return g;
    });
    // Client le plus récemment facturé en premier
    arr.sort((a, b) => new Date(b.last || 0) - new Date(a.last || 0));
    return arr;
  }, [invoices]);

  // Recherche (client / email / n° de facture)
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groups;
    return groups.filter((g) =>
      g.client.toLowerCase().includes(s) ||
      g.email.toLowerCase().includes(s) ||
      g.invoices.some((i) => (i.number || '').toLowerCase().includes(s))
    );
  }, [groups, q]);

  // Pagination
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const curPage = Math.min(page, pages);
  const shown = filtered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);
  useEffect(() => { setPage(1); }, [q]);

  const toggle = (key) => setOpen((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  const totalPaid = invoices.filter((i) => i.status === 'paid').reduce((a, i) => a + (i.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold font-sora text-white">Facturation</h2>
          <p className="text-sm text-slate-400 font-inter mt-1">
            {groups.length} client{groups.length > 1 ? 's' : ''} · {invoices.length} facture{invoices.length > 1 ? 's' : ''}
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
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[#5B6CFF]" /></div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <FileText className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">{invoices.length === 0 ? 'Aucune facture pour le moment.' : 'Aucun résultat.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((g) => {
            const isOpen = open.has(g.key);
            return (
              <div key={g.key} className="rounded-2xl border border-white/[0.06] bg-[#0f172a] overflow-hidden">
                {/* En-tête client (cliquable) */}
                <button onClick={() => toggle(g.key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center text-white text-xs font-bold flex-shrink-0">
                    {initials(g.client)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-medium truncate">{g.client}</div>
                    {g.email && <div className="text-[12px] text-slate-500 truncate">{g.email}</div>}
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-[13px] text-slate-300">{g.invoices.length} facture{g.invoices.length > 1 ? 's' : ''}</div>
                    <div className="text-[12px] text-slate-500">{fmtDate(g.first)} → {fmtDate(g.last)}</div>
                  </div>
                  <div className="text-[#3AFFA3] font-semibold text-sm whitespace-nowrap tabular-nums w-24 text-right">
                    {g.total.toFixed(0)} €
                  </div>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                </button>

                {/* Factures du client */}
                {isOpen && (
                  <div className="border-t border-white/[0.06] overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 text-[12px]">
                          <th className="px-4 py-2 font-medium">Date</th>
                          <th className="px-4 py-2 font-medium">N°</th>
                          <th className="px-4 py-2 font-medium text-right">Montant</th>
                          <th className="px-4 py-2 font-medium">Statut</th>
                          <th className="px-4 py-2 font-medium text-right">PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.invoices.map((i, idx) => {
                          const st = STATUS[i.status] || { label: i.status || '—', cls: 'bg-slate-500/12 text-slate-400 border-slate-500/25' };
                          return (
                            <tr key={i.number || idx} className="border-t border-white/[0.04]">
                              <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap">{fmtDate(i.date)}</td>
                              <td className="px-4 py-2.5 text-slate-400 font-mono text-[12px]">{i.number || '—'}</td>
                              <td className="px-4 py-2.5 text-right text-white font-semibold whitespace-nowrap tabular-nums">{money(i.amount, i.currency)}</td>
                              <td className="px-4 py-2.5">
                                <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
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
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && pages > 1 && (
        <div className="flex items-center justify-between gap-4 pt-2">
          <span className="text-[13px] text-slate-500">Page {curPage} / {pages}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage <= 1}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 text-sm hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Précédent
            </button>
            <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={curPage >= pages}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 text-sm hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
