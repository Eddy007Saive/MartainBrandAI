import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useUser } from '../context/UserContext';
import { scheduleService } from '../services/scheduleService';
import { DEFAULT_SCHEDULE } from '../constants/schedules';
import { SocialIcon } from '../components/SocialIcon';
import { TEMPLATES, SLIDE_LABELS, SLIDE_CSS, renderSlides } from '../lib/carrouselPreview';

// Réseaux qui supportent le carrousel (pas YouTube)
const NETS = [
  { id: 'linkedin', label: 'LinkedIn', bg: '#0A66C2', note: 'Publié en PDF (document)' },
  { id: 'instagram', label: 'Instagram', bg: 'linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)', note: 'Carrousel d’images (jusqu’à 10)' },
  { id: 'facebook', label: 'Facebook', bg: '#1877F2', note: 'Carrousel d’images' },
];
const labelOf = (id) => TEMPLATES.find((t) => t.id === id)?.label || 'Crème';

export default function CarrouselsPage() {
  const { user } = useUser();
  const colors = useMemo(() => ({ p: user?.couleur_principale, s: user?.couleur_secondaire, a: user?.couleur_accent }), [user]);

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState('linkedin');
  const [sel, setSel] = useState({});       // sélection en cours (non enregistrée)
  const [saved, setSaved] = useState({});    // dernière sélection enregistrée
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await scheduleService.getAll();
        setSchedules(data || []);
        const map = {};
        NETS.forEach((n) => {
          const row = (data || []).find((r) => r.platform === n.id);
          map[n.id] = row?.carrousel_template || 'creme';
        });
        setSel(map); setSaved({ ...map });
      } catch (e) {
        const map = {}; NETS.forEach((n) => { map[n.id] = 'creme'; });
        setSel(map); setSaved({ ...map });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (net) => {
    setSaving(net);
    try {
      const rows = [...schedules];
      const idx = rows.findIndex((r) => r.platform === net);
      if (idx >= 0) rows[idx] = { ...rows[idx], carrousel_template: sel[net] };
      else rows.push({ platform: net, ...DEFAULT_SCHEDULE, carrousel_template: sel[net] });
      const out = await scheduleService.save(rows);
      setSchedules(out || rows);
      setSaved((p) => ({ ...p, [net]: sel[net] }));
      toast.success(`Style « ${labelOf(sel[net])} » enregistré pour ${NETS.find((n) => n.id === net)?.label}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec de l'enregistrement");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="max-w-5xl">
      <style dangerouslySetInnerHTML={{ __html: SLIDE_CSS }} />
      <h1 className="text-2xl font-bold font-sora text-white">Styles de carrousel</h1>
      <p className="text-sm text-slate-400 font-inter mt-1 mb-6">
        Un style par réseau, dans <span className="text-slate-200">tes couleurs</span>. Déplie un réseau, choisis un style, fais défiler les 5 slides, puis <span className="text-slate-200">enregistre</span>.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" /> Chargement…</div>
      ) : (
        <div className="space-y-3.5">
          {NETS.map((nt) => {
            const isOpen = open === nt.id;
            const dirty = sel[nt.id] !== saved[nt.id];
            return (
              <div key={nt.id} className={`rounded-2xl border bg-[#0b1322] overflow-hidden transition-all ${isOpen ? 'border-[#5B6CFF]/40' : 'border-white/8'}`}>
                {/* header */}
                <button onClick={() => setOpen(isOpen ? null : nt.id)} data-testid={`carr-net-${nt.id}`}
                  className="w-full flex items-center gap-3.5 px-5 py-4 text-left">
                  <span className="w-9 h-9 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: nt.bg }}>
                    <SocialIcon network={nt.id} className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-sora font-semibold text-[15px] text-white">{nt.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">Style : <span className="text-[#3AFFA3] font-medium">{labelOf(saved[nt.id])}</span> · {nt.note}</div>
                  </div>
                  <ChevronRight className={`w-5 h-5 text-slate-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90 text-white' : ''}`} />
                </button>

                {/* body */}
                {isOpen && (
                  <div className="px-5 pb-5 animate-fade-in">
                    <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase mb-3">Choisis un style</div>
                    <div className="flex gap-3 overflow-x-auto pb-1.5">
                      {TEMPLATES.map((t) => {
                        const on = sel[nt.id] === t.id;
                        const hero = renderSlides(t.id, colors)[0];
                        return (
                          <button key={t.id} type="button" onClick={() => setSel((p) => ({ ...p, [nt.id]: t.id }))}
                            data-testid={`carr-tpl-${nt.id}-${t.id}`}
                            className={`flex-shrink-0 w-[122px] rounded-xl p-1.5 border transition-all ${on ? 'border-[#5B6CFF] bg-[#5B6CFF]/10' : 'border-white/8 bg-white/[0.015] hover:border-white/25'}`}>
                            <div className="w-full h-[134px] overflow-hidden rounded-lg">
                              <div style={{ transform: 'scale(0.55)', transformOrigin: 'top left', width: 200, height: 250 }} dangerouslySetInnerHTML={{ __html: hero }} />
                            </div>
                            <div className={`text-center text-[11.5px] mt-1.5 ${on ? 'text-white font-semibold' : 'text-slate-400'}`}>{t.label}</div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between mt-5 mb-2.5">
                      <div>
                        <div className="text-[13px] text-slate-200 font-medium">Aperçu — 5 slides</div>
                        <div className="text-[11.5px] text-slate-500">Fais défiler horizontalement →</div>
                      </div>
                      <button onClick={() => save(nt.id)} disabled={!dirty || saving === nt.id}
                        data-testid={`carr-save-${nt.id}`}
                        className={`text-[13px] font-semibold px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${dirty ? 'bg-[#e7ecf5] text-[#0b1322] hover:bg-white' : 'bg-white/5 text-slate-500 cursor-default'}`}>
                        {saving === nt.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (!dirty && <Check className="w-4 h-4" />)}
                        {!dirty ? 'Enregistré' : 'Enregistrer'}
                      </button>
                    </div>
                    <div className="flex gap-3.5 overflow-x-auto pt-1 pb-3">
                      {renderSlides(sel[nt.id], colors).map((s, i) => (
                        <div key={i} className="flex-shrink-0">
                          <div dangerouslySetInnerHTML={{ __html: s }} />
                          <div className="text-[11px] text-slate-500 text-center mt-2 font-medium">{SLIDE_LABELS[i] || ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
