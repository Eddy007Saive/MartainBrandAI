import { useState, useEffect, useMemo } from 'react';
import { Calendar, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { contenuService } from '../services/contenuService';
import { useUser } from '../context/UserContext';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_COURT = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];

// Statuts (clés = valeurs enum DB) -> couleurs
const STATUT = {
  'A valider':       { label: 'À valider', bg: 'rgba(251,191,36,.15)',  co: '#fcd770', sw: '#fbbf24' },
  'Valider':         { label: 'Validé',    bg: 'rgba(52,211,153,.15)',  co: '#6ee7b7', sw: '#34d399' },
  'Planifie':        { label: 'Planifié',  bg: 'rgba(138,108,255,.18)', co: '#c4b5fd', sw: '#8A6CFF' },
  'Pret a publier':  { label: 'Prêt',      bg: 'rgba(138,108,255,.18)', co: '#c4b5fd', sw: '#8A6CFF' },
  'Publie':          { label: 'Publié',    bg: 'rgba(96,165,250,.15)',  co: '#93c5fd', sw: '#60a5fa' },
  'Refuse':          { label: 'Refusé',    bg: 'rgba(248,113,113,.15)', co: '#fca5a5', sw: '#f87171' },
};
const ST_DEFAUT = { label: '—', bg: 'rgba(148,163,184,.15)', co: '#cbd5e1', sw: '#94a3b8' };
const stOf = (s) => STATUT[s] || ST_DEFAUT;

// Réseaux -> pastille
const NET = {
  LinkedIn:  { s: 'in', style: { background: '#0a66c2' } },
  Instagram: { s: '◎', style: { background: 'linear-gradient(135deg,#feda75,#d62976 45%,#962fbf)' } },
  Facebook:  { s: 'f', style: { background: '#1877f2' } },
  TikTok:    { s: '♪', style: { background: '#111', border: '1px solid #2b2b2b' } },
  YouTube:   { s: '▶', style: { background: '#ff0000' } },
};
const netOf = (r) => NET[r] || { s: '•', style: { background: '#334155' } };

const LEGENDE = ['A valider', 'Valider', 'Planifie', 'Publie', 'Refuse'];

export default function PlanificationPage() {
  const { user } = useUser();
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState('mois'); // mois | liste
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    contenuService.getAll()
      .then((d) => setContenus(d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date();
  const year = current.getFullYear();
  const month = current.getMonth();

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0).getDate();
    let start = firstDay.getDay() - 1; if (start < 0) start = 6; // lundi=0
    const arr = [];
    for (let i = start - 1; i >= 0; i--) arr.push({ date: new Date(year, month, -i), out: true });
    for (let i = 1; i <= last; i++) arr.push({ date: new Date(year, month, i), out: false });
    while (arr.length % 7 !== 0 || arr.length < 35) arr.push({ date: new Date(year, month, last + (arr.length % 7) + 1), out: true, pad: true });
    return arr.slice(0, arr.length <= 35 ? 35 : 42);
  }, [year, month]);

  const forDate = (date) => contenus.filter((c) => {
    if (!c.date_publication) return false;
    return new Date(c.date_publication).toDateString() === date.toDateString();
  });
  const hhmm = (iso) => { try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  const moisContenus = useMemo(() => contenus
    .filter((c) => { if (!c.date_publication) return false; const d = new Date(c.date_publication); return d.getFullYear() === year && d.getMonth() === month; })
    .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication)), [contenus, year, month]);

  const upcoming = useMemo(() => contenus
    .filter((c) => c.date_publication && new Date(c.date_publication) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication))
    .slice(0, 5), [contenus]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMonth = (d) => { setCurrent(new Date(year, month + d, 1)); setOpenId(null); };
  const goToday = () => { setCurrent(new Date()); setOpenId(null); };

  const Pill = ({ c, inCell }) => {
    const st = stOf(c.statut), net = netOf(c.reseau_cible);
    const open = openId === c.id;
    return (
      <div className="relative">
        <button
          onClick={(e) => { e.stopPropagation(); setOpenId(open ? null : c.id); }}
          className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] border transition-all hover:brightness-125 text-left"
          style={{ background: st.bg, color: st.co, borderColor: st.bg }}
        >
          <span className="w-[15px] h-[15px] rounded-[4px] grid place-items-center text-[9px] font-bold text-white shrink-0" style={net.style}>{net.s}</span>
          <span className="flex-1 truncate font-medium">{c.titre || c.contenu?.slice(0, 30) || 'Sans titre'}</span>
          {inCell && <span className="text-[9.5px] opacity-70 shrink-0">{hhmm(c.date_publication)}</span>}
        </button>
        {open && (
          <div className="absolute z-30 top-9 left-0 w-[230px] rounded-xl border border-white/10 bg-[#111a2e] p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-[22px] h-[22px] rounded-md grid place-items-center text-[11px] font-bold text-white" style={net.style}>{net.s}</span>
              <span className="text-xs font-semibold">{c.reseau_cible || '—'}</span>
              <span className="text-[11px] text-slate-500 ml-auto">{hhmm(c.date_publication)}</span>
            </div>
            <p className="text-[12.5px] text-slate-200 leading-snug mb-2.5 line-clamp-3">{c.titre || c.contenu?.slice(0, 90)}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.co }}>{st.label}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full space-y-5 pb-10" onClick={() => setOpenId(null)}>
      <PageHeader
        icon={Calendar}
        title="Planification"
        subtitle="Vue calendrier de tes publications."
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3AFFA3] shadow-[0_0_8px_#3AFFA3]" />
            <span className="text-xs text-slate-400 font-inter">Crédits</span>
            <span className="text-sm font-semibold text-white font-inter">{user?.credits ?? '—'}</span>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] grid place-items-center hover:bg-white/[0.06] transition-colors"><ChevronLeft className="w-[18px] h-[18px]" /></button>
          <div className="text-lg font-semibold font-sora min-w-[150px] text-center">{MOIS[month]} <span className="text-slate-500 font-medium">{year}</span></div>
          <button onClick={() => changeMonth(1)} className="w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] grid place-items-center hover:bg-white/[0.06] transition-colors"><ChevronRight className="w-[18px] h-[18px]" /></button>
          <button onClick={goToday} className="px-3.5 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.06] text-xs font-semibold font-inter transition-colors">Aujourd'hui</button>
        </div>
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {[['mois', 'Mois'], ['liste', 'Liste']].map(([id, lab]) => (
            <button key={id} onClick={() => setView(id)} className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all ${view === id ? 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white' : 'text-slate-400 hover:text-white'}`}>{lab}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" /></div>
      ) : view === 'mois' ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-3.5">
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-2 mb-2 min-w-[760px]">
              {JOURS.map((j) => <div key={j} className="px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-slate-600 font-semibold font-inter">{j}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2 min-w-[760px]">
              {days.map((d, i) => {
                const evs = d.out ? [] : forDate(d.date);
                const isToday = !d.out && d.date.toDateString() === today.toDateString();
                return (
                  <div key={i} className={`min-h-[118px] rounded-xl border p-2 flex flex-col gap-1.5 transition-all ${d.out ? 'bg-white/[0.01] border-white/[0.04] opacity-40' : 'bg-[#0a1120] border-white/[0.06] hover:border-white/10'} ${isToday ? 'ring-1 ring-[#5B6CFF]/55 border-[#5B6CFF]/55' : ''}`}>
                    <div className={`text-[12.5px] font-semibold font-inter ${isToday ? 'text-white' : 'text-slate-500'}`}>
                      {isToday ? <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] grid place-items-center text-white text-[11px] inline-grid">{d.date.getDate()}</span> : d.date.getDate()}
                    </div>
                    {evs.slice(0, 3).map((c) => <Pill key={c.id} c={c} inCell />)}
                    {evs.length > 3 && <div className="text-[10.5px] text-slate-500 px-1.5 font-medium">+{evs.length - 3} autres</div>}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Légende */}
          <div className="flex flex-wrap gap-4 mt-3.5 pt-3.5 border-t border-white/[0.06]">
            {LEGENDE.map((k) => (
              <div key={k} className="flex items-center gap-2 text-xs text-slate-400 font-inter">
                <span className="w-[11px] h-[11px] rounded" style={{ background: stOf(k).sw }} />{stOf(k).label}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Vue liste */
        <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a] p-4 space-y-2.5">
          {moisContenus.length === 0 ? (
            <p className="text-center py-12 text-slate-500 font-inter text-sm">Aucun contenu planifié sur {MOIS[month]}.</p>
          ) : moisContenus.map((c) => {
            const st = stOf(c.statut), net = netOf(c.reseau_cible);
            return (
              <div key={c.id} className="flex items-center gap-4 p-3 rounded-xl border border-white/[0.06] bg-[#0a1120]">
                <div className="text-center min-w-[46px]">
                  <div className="text-xl font-bold font-sora leading-none">{new Date(c.date_publication).getDate()}</div>
                  <div className="text-[10.5px] text-slate-500 uppercase mt-0.5">{MOIS_COURT[new Date(c.date_publication).getMonth()]}</div>
                </div>
                <div className="w-[30px] h-[30px] rounded-lg grid place-items-center text-xs font-bold text-white shrink-0" style={net.style}>{net.s}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 50)}</div>
                  <div className="text-[11.5px] text-slate-500 mt-0.5">{c.reseau_cible || '—'} · {hhmm(c.date_publication)}</div>
                </div>
                <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.co }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Prochaines publications */}
      <div>
        <h3 className="text-sm font-semibold font-sora mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-[#8A6CFF]" />Prochaines publications</h3>
        {upcoming.length === 0 ? (
          <p className="text-slate-500 font-inter text-sm">Aucune publication planifiée.</p>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((c) => {
              const st = stOf(c.statut), net = netOf(c.reseau_cible);
              return (
                <div key={c.id} className="flex items-center gap-4 p-3 rounded-2xl border border-white/[0.06] bg-[#0f172a]">
                  <div className="text-center min-w-[46px]">
                    <div className="text-xl font-bold font-sora leading-none">{new Date(c.date_publication).getDate()}</div>
                    <div className="text-[10.5px] text-slate-500 uppercase mt-0.5">{MOIS_COURT[new Date(c.date_publication).getMonth()]}</div>
                  </div>
                  <div className="w-[30px] h-[30px] rounded-lg grid place-items-center text-xs font-bold text-white shrink-0" style={net.style}>{net.s}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-slate-200 truncate">{c.titre || c.contenu?.slice(0, 50)}</div>
                    <div className="text-[11.5px] text-slate-500 mt-0.5">{c.reseau_cible || '—'} · {hhmm(c.date_publication)}</div>
                  </div>
                  <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.co }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
