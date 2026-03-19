import { useState, useEffect } from 'react';
import { Calendar, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import api from '../lib/api';

const STATUT_COLORS = {
  'A valider': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Validé': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Publié': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Refusé': 'bg-red-500/20 text-red-400 border-red-500/30',
};

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function PlanificationPage() {
  const [contenus, setContenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    fetchContenus();
  }, []);

  const fetchContenus = async () => {
    try {
      const response = await api.get('/contenus');
      setContenus(response.data);
    } catch (error) {
      console.error('Erreur chargement contenus:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Adjust for Monday start (0 = Monday, 6 = Sunday)
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    const days = [];
    
    // Previous month days
    for (let i = startDay - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push({ date: prevDate, isCurrentMonth: false });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    
    // Next month days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    
    return days;
  };

  const getContenusForDate = (date) => {
    return contenus.filter(c => {
      if (!c.date_publication) return false;
      const pubDate = new Date(c.date_publication);
      return pubDate.toDateString() === date.toDateString();
    });
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const today = new Date();
  const days = getDaysInMonth(currentDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-sora text-white">Planification</h1>
          <p className="text-slate-400 font-inter text-sm mt-1">
            Visualisez vos publications planifiées
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" />
        </div>
      ) : (
        <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevMonth}
              className="text-slate-400 hover:text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-xl font-semibold text-white font-sora">
              {MOIS[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextMonth}
              className="text-slate-400 hover:text-white"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day headers */}
            {JOURS.map((jour) => (
              <div key={jour} className="text-center text-slate-500 text-sm font-inter py-2">
                {jour}
              </div>
            ))}
            
            {/* Days */}
            {days.map((day, index) => {
              const dayContenus = getContenusForDate(day.date);
              const isToday = day.date.toDateString() === today.toDateString();
              
              return (
                <div
                  key={index}
                  className={`min-h-[100px] p-2 rounded-lg border transition-all ${
                    day.isCurrentMonth
                      ? 'bg-slate-800/30 border-slate-800 hover:border-[#5B6CFF]/30'
                      : 'bg-slate-900/20 border-transparent opacity-50'
                  } ${isToday ? 'ring-2 ring-[#5B6CFF]' : ''}`}
                >
                  <div className={`text-sm font-inter mb-1 ${
                    isToday ? 'text-[#5B6CFF] font-bold' : day.isCurrentMonth ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                    {day.date.getDate()}
                  </div>
                  
                  <div className="space-y-1">
                    {dayContenus.slice(0, 2).map((c) => (
                      <div
                        key={c.id}
                        className="text-xs p-1 rounded truncate"
                        style={{
                          backgroundColor: c.statut === 'Publié' ? 'rgba(59, 130, 246, 0.2)' :
                                          c.statut === 'Validé' ? 'rgba(16, 185, 129, 0.2)' :
                                          'rgba(245, 158, 11, 0.2)',
                          color: c.statut === 'Publié' ? '#60a5fa' :
                                c.statut === 'Validé' ? '#34d399' :
                                '#fbbf24'
                        }}
                        title={c.titre || c.contenu?.substring(0, 50)}
                      >
                        {c.titre || c.contenu?.substring(0, 20)}...
                      </div>
                    ))}
                    {dayContenus.length > 2 && (
                      <div className="text-xs text-slate-500 font-inter">
                        +{dayContenus.length - 2} autres
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-amber-500/40"></div>
              <span className="text-xs text-slate-400 font-inter">À valider</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-emerald-500/40"></div>
              <span className="text-xs text-slate-400 font-inter">Validé</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-blue-500/40"></div>
              <span className="text-xs text-slate-400 font-inter">Publié</span>
            </div>
          </div>
        </div>
      )}

      {/* Liste des prochaines publications */}
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white font-sora mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#5B6CFF]" />
          Prochaines publications
        </h2>
        
        {contenus.filter(c => c.date_publication && new Date(c.date_publication) >= today).length === 0 ? (
          <p className="text-slate-400 font-inter text-sm">Aucune publication planifiée</p>
        ) : (
          <div className="space-y-3">
            {contenus
              .filter(c => c.date_publication && new Date(c.date_publication) >= today)
              .sort((a, b) => new Date(a.date_publication) - new Date(b.date_publication))
              .slice(0, 5)
              .map((c) => (
                <div key={c.id} className="flex items-center gap-4 p-3 bg-slate-800/30 rounded-lg">
                  <div className="text-center min-w-[50px]">
                    <div className="text-2xl font-bold text-white font-sora">
                      {new Date(c.date_publication).getDate()}
                    </div>
                    <div className="text-xs text-slate-500 font-inter">
                      {MOIS[new Date(c.date_publication).getMonth()].substring(0, 3)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-inter truncate">
                      {c.titre || c.contenu?.substring(0, 50)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {c.reseau_cible && (
                        <span className="text-xs text-slate-500">{c.reseau_cible}</span>
                      )}
                      <Badge className={STATUT_COLORS[c.statut] || 'bg-slate-500/20 text-slate-400'}>
                        {c.statut}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
