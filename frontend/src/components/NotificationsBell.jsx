import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { notificationService } from '../services/notificationService';

const EVENT_DOT = {
  'post.published': 'bg-emerald-400',
  'post.failed': 'bg-red-400',
  'post.platform.failed': 'bg-red-400',
  'post.partial': 'bg-amber-400',
  'post.scheduled': 'bg-cyan-400',
  'post.cancelled': 'bg-slate-400',
};

export default function NotificationsBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    try {
      const d = await notificationService.list();
      setItems(d.items || []);
      setUnread(d.unread || 0);
    } catch (e) { /* silencieux */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
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
          <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Notifications</div>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 px-2 py-8 text-center font-inter">Aucune notification</p>
          ) : items.map((n) => (
            <div key={n.id} className={`px-3 py-2.5 rounded-lg ${n.lu ? '' : 'bg-white/[0.03]'} hover:bg-white/[0.05] transition-colors`}>
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
