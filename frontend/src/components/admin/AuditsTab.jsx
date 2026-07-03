import { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { Loader2, RefreshCw, Mail, Eye, Inbox, Send, CheckCircle, FileDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { adminService } from '../../services/adminService';

const STATUS = {
  nouveau: { label: 'Nouveau', cls: 'bg-[#3AFFA3]/15 text-[#3AFFA3] border-[#3AFFA3]/30' },
  en_cours: { label: 'En cours', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  traite: { label: 'Traité', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

const fmtDate = (d) => {
  try { return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
};

export default function AuditsTab() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // audit détaillé
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminService.getAudits();
      setAudits(data.audits || []);
    } catch (e) {
      toast.error('Erreur de chargement des audits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (id) => {
    setLoadingDetail(true);
    setSelected({ id, loading: true });
    try {
      const full = await adminService.getAudit(id);
      setSelected(full);
      setSubject(`Ton audit de marque — ${full.marque || 'PresenceOS'}`);
      setMessage('');
    } catch (e) {
      toast.error('Impossible de charger cet audit');
      setSelected(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const sendReply = async () => {
    if (!message.trim()) { toast.error('Écris un message'); return; }
    setSending(true);
    try {
      await adminService.replyAudit(selected.id, subject.trim(), message.trim());
      toast.success('Réponse envoyée ✓');
      setSelected((s) => ({ ...s, status: 'traite' }));
      setMessage('');
      load();
    } catch (e) {
      toast.error("L'email n'a pas pu être envoyé (config Resend ?)");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status) => {
    try {
      await adminService.setAuditStatus(selected.id, status);
      setSelected((s) => ({ ...s, status }));
      load();
    } catch (e) {
      toast.error('Erreur');
    }
  };

  const downloadPdf = () => {
    const a = selected;
    if (!a) return;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const M = 44;
    const W = doc.internal.pageSize.getWidth() - M * 2;
    const H = doc.internal.pageSize.getHeight();
    // En-tête
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(18, 22, 38);
    doc.text('Audit de marque', M, 56);
    doc.setFontSize(13); doc.setTextColor(70, 78, 130);
    doc.text(a.marque || 'Sans nom', M, 76);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(120, 130, 150);
    doc.text(`${a.email || '—'}   ·   reçu le ${fmtDate(a.created_at)}`, M, 92);
    doc.setDrawColor(220); doc.line(M, 102, M + W, 102);
    // Corps (récap) — on assainit les caractères non gérés par la police PDF
    const clean = (a.recap || '(pas de récapitulatif)').replace(/[═─]/g, '-').replace(/•/g, '-');
    doc.setFontSize(10); doc.setTextColor(35, 40, 55);
    const lines = doc.splitTextToSize(clean, W);
    let y = 122;
    lines.forEach((ln) => {
      if (y > H - 40) { doc.addPage(); y = 50; }
      doc.text(ln, M, y); y += 13.5;
    });
    const safe = (a.marque || 'audit').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`audit_${safe}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-sora text-white">Audits de marque</h2>
          <p className="text-sm text-slate-500 font-inter mt-1">Leads reçus via le questionnaire public /audit-marque</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : audits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
          <Inbox className="w-10 h-10 opacity-40" />
          <p className="font-inter text-sm">Aucun audit reçu pour le moment.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-slate-950/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/5">
                <th className="px-4 py-3 font-medium font-inter">Marque</th>
                <th className="px-4 py-3 font-medium font-inter hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 font-medium font-inter hidden md:table-cell">Reçu le</th>
                <th className="px-4 py-3 font-medium font-inter">Statut</th>
                <th className="px-4 py-3 font-medium font-inter text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => {
                const st = STATUS[a.status] || STATUS.nouveau;
                return (
                  <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white font-medium font-inter">{a.marque || <span className="text-slate-500">—</span>}</td>
                    <td className="px-4 py-3 text-slate-400 font-inter hidden sm:table-cell">{a.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 font-inter hidden md:table-cell whitespace-nowrap">{fmtDate(a.created_at)}</td>
                    <td className="px-4 py-3"><Badge className={`${st.cls} border font-inter`}>{st.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="gap-1.5 text-slate-300 hover:text-white" onClick={() => openDetail(a.id)}>
                        <Eye className="w-4 h-4" /> Voir
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Détail + réponse */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-w-2xl bg-[#0f172a] border-white/10 text-white max-h-[88vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/5">
            <DialogTitle className="font-sora flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#8A6CFF]" />
              {selected?.marque || 'Audit de marque'}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail || selected?.loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
          ) : selected ? (
            <div className="overflow-y-auto px-6 py-5 space-y-5">
              {/* Meta */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-inter">Email :</span>
                  <a href={`mailto:${selected.email}`} className="text-[#8A6CFF] hover:underline font-inter">{selected.email || '—'}</a>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-inter">Reçu le :</span>
                  <span className="text-slate-300 font-inter">{fmtDate(selected.created_at)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {['nouveau', 'en_cours', 'traite'].map((s) => {
                    const cfg = STATUS[s];
                    const on = selected.status === s;
                    return (
                      <button key={s} onClick={() => changeStatus(s)}
                        className={`text-xs px-2.5 py-1 rounded-full border font-inter transition-all ${on ? cfg.cls : 'border-white/10 text-slate-500 hover:text-slate-300'}`}>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Récap complet */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wider text-slate-500 font-inter">Réponses</p>
                  <Button size="sm" variant="ghost" onClick={downloadPdf} className="h-7 gap-1.5 text-slate-300 hover:text-white">
                    <FileDown className="w-3.5 h-3.5" /> Télécharger en PDF
                  </Button>
                </div>
                <pre className="bg-[#0b1120] border border-white/5 rounded-xl p-4 text-[12.5px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap max-h-72 overflow-y-auto">
{selected.recap || '(pas de récapitulatif)'}
                </pre>
              </div>

              {/* Réponse par email */}
              <div className="border-t border-white/5 pt-5">
                <p className="text-xs uppercase tracking-wider text-slate-500 font-inter mb-3">Répondre par email</p>
                <div className="space-y-3">
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet"
                    className="bg-[#0c111f] border-white/10 text-white" />
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6}
                    placeholder={`Bonjour ${selected.marque || ''}, merci pour ton audit…`}
                    className="bg-[#0c111f] border-white/10 text-white resize-y" />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-600 font-inter flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> L'envoi marque le lead comme « Traité ».
                    </p>
                    <Button onClick={sendReply} disabled={sending || !selected.email}
                      className="gap-2 bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] hover:opacity-90">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Envoyer la réponse
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
