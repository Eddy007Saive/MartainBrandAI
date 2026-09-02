import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { notificationService } from '../services/notificationService';

const CLE_SON = 'postorico_notif_son';

// Petit carillon (deux notes, ~0,3 s) synthétisé avec la Web Audio API : aucun
// fichier à charger, et ça reste discret. Le navigateur peut refuser de jouer un
// son avant la première interaction sur la page : on échoue alors en silence.
function carillon() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [[660, 0], [880, 0.14]];
    notes.forEach(([freq, depart]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + depart;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.25);
    });
    setTimeout(() => { try { ctx.close(); } catch (e) { /* ignore */ } }, 600);
  } catch (e) { /* autoplay bloqué ou API absente : pas de son, pas d'erreur */ }
}

const EVENT_DOT = {
  'post.published': 'bg-emerald-400',
  'post.failed': 'bg-red-400',
  'post.platform.failed': 'bg-red-400',
  'post.partial': 'bg-amber-400',
  'post.scheduled': 'bg-cyan-400',
  'post.cancelled': 'bg-slate-400',
  // Rendus en arrière-plan (stories animées)
  'story.anime.ready': 'bg-emerald-400',
  'story.anime.echec': 'bg-red-400',
  'reel.ready': 'bg-emerald-400',
  'reel.echec': 'bg-red-400',
};

export default function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  // Une notification liée à un contenu (publication, rendu terminé) ramène à la
  // liste Contenus — c'est là que l'utilisateur voit le résultat.
  const ouvrir = (n) => {
    if (!n.contenu_id) return;
    setOpen(false);
    navigate('/dashboard/contenus');
  };

  // Son à l'arrivée d'une nouvelle notification (activé par défaut, mémorisé).
  const [son, setSon] = useState(() => {
    try { return localStorage.getItem(CLE_SON) !== '0'; } catch (e) { return true; }
  });
  const sonRef = useRef(son);
  sonRef.current = son;
  const nonLuesPrec = useRef(null); // null = premier chargement, on ne sonne pas

  const basculerSon = (e) => {
    e.stopPropagation();
    const v = !son;
    setSon(v);
    try { localStorage.setItem(CLE_SON, v ? '1' : '0'); } catch (err) { /* ignore */ }
    if (v) carillon(); // aperçu immédiat
  };

  const load = async () => {
    try {
      const d = await notificationService.list();
      const nonLues = d.unread || 0;
      setItems(d.items || []);
      setUnread(nonLues);
      // Une (ou plusieurs) nouvelle(s) non lue(s) depuis le dernier passage -> carillon.
      if (nonLuesPrec.current !== null && nonLues > nonLuesPrec.current && sonRef.current) carillon();
      nonLuesPrec.current = nonLues;
    } catch (e) { /* silencieux */ }
  };

  useEffect(() => {
    load();
    // 20 s (au lieu de 60) : un rendu qui se termine doit sonner sans attendre.
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) {
      try {
        await notificationService.markAll();
        setUnread(0);
        setItems((prev) => prev.map((n) => ({ ...n, lu: true })));
      } catch (e) { /* ignore */ }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} data-testid="notif-bell"
        className="relative w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] flex items-center justify-center text-slate-300 transition-colors">
        <Bell className="w-[18px] h-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[26rem] overflow-y-auto rounded-xl border border-white/10 bg-[#0b1322] shadow-2xl z-[60] p-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Notifications</span>
            <button type="button" onClick={basculerSon} data-testid="notif-son"
              title={son ? 'Son activé : cliquer pour couper' : 'Son coupé : cliquer pour activer'}
              className="w-7 h-7 rounded-md grid place-items-center text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors">
              {son ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 px-2 py-8 text-center font-inter">Aucune notification</p>
          ) : items.map((n) => (
            <div key={n.id} onClick={() => ouvrir(n)} role={n.contenu_id ? 'button' : undefined}
              className={`px-3 py-2.5 rounded-lg ${n.lu ? '' : 'bg-white/[0.03]'} hover:bg-white/[0.05] transition-colors ${n.contenu_id ? 'cursor-pointer' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${EVENT_DOT[n.event] || 'bg-slate-500'}`} />
                <div className="text-[13px] text-white font-medium font-inter">{n.titre}</div>
              </div>
              <div className="text-[12px] text-slate-400 mt-0.5 font-inter pl-3.5">{n.message}</div>
              <div className="text-[10px] text-slate-600 mt-1 pl-3.5">
                {new Date(n.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
