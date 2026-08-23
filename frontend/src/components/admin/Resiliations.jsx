import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, TrendingDown } from 'lucide-react';

import { adminService } from '../../services/adminService';

/**
 * Les départs et leurs raisons, côté back-office.
 *
 * C'est la seule donnée que produit le moment où quelqu'un s'en va — la
 * collecter puis la laisser en base sans moyen de la lire revient à ne pas
 * l'avoir collectée.
 *
 * Deux choses à voir ici, dans cet ordre : quel motif revient le plus, et ce
 * que les gens ont écrit à la main. Le classement dit où chercher, les
 * commentaires disent quoi corriger — un motif « trop cher » qui cache en
 * réalité « je n'ai pas compris comment m'en servir » ne se lit que là.
 */
const LIBELLES = {
  prix: 'Trop cher',
  temps: "Pas le temps",
  resultats: 'Pas de résultats',
  complexite: 'Trop compliqué',
  fonctionnalite: 'Fonctionnalité manquante',
  concurrent: 'Concurrent',
  test: 'Juste pour tester',
  autre: 'Autre',
};

const ISSUES = {
  // « entamée » : la personne a donné sa raison puis fermé la fenêtre sans
  // rien décider. Elle est toujours cliente — et c'est la ligne la plus utile
  // du tableau, celle d'un client qui a failli partir et n'a rien dit d'autre.
  entamee: ['Indécis', '#94a3b8'],
  partie: ['Parti', '#f87171'],
  retenue: ['Retenu', '#3AFFA3'],
  pause: ['En pause', '#8A6CFF'],
};

const jour = (d) => new Date(d).toLocaleDateString('fr-FR', {
  day: '2-digit', month: '2-digit', year: '2-digit',
});

export default function Resiliations() {
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState(null);

  const lire = () => {
    setChargement(true);
    adminService.resiliations()
      .then(setData)
      .catch(() => setData({ lignes: [], par_raison: {}, total: 0, retenus: 0 }))
      .finally(() => setChargement(false));
  };
  useEffect(lire, []);

  const classement = useMemo(() => Object.entries(data?.par_raison || {})
    .sort((a, b) => b[1] - a[1]), [data]);
  const lignes = useMemo(() => (data?.lignes || [])
    .filter((l) => !filtre || l.raison === filtre), [data, filtre]);

  // Le taux de rétention n'a de sens que rapporté aux parcours ENTAMÉS : c'est
  // la question à laquelle il répond — sur ceux qui ont voulu partir, combien
  // sont restés.
  const taux = data?.total ? Math.round((data.retenus / data.total) * 100) : null;

  if (chargement && !data) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-[#5B6CFF]" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="admin-resiliations">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-sora font-bold text-white text-[19px]">Départs</h2>
          <p className="text-[13px] text-slate-500 font-inter mt-0.5">
            {data?.total || 0} parcours de résiliation entamés
            {taux !== null && <> · <span className="text-[#3AFFA3]">{taux} % retenus</span></>}
          </p>
        </div>
        <button onClick={lire} disabled={chargement}
          className="inline-flex items-center gap-2 text-[13px] text-slate-400 hover:text-white
                     border border-white/10 rounded-xl px-3.5 py-2 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'animate-spin' : ''}`} />Actualiser
        </button>
      </div>

      {!data?.total ? (
        // Un tableau vide n'est pas une erreur : c'est la bonne nouvelle.
        <div className="rounded-2xl border border-white/[0.06] bg-[#0a1120] p-10 text-center">
          <TrendingDown className="w-7 h-7 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-inter text-[14px]">Personne n'est encore parti.</p>
          <p className="text-slate-600 font-inter text-[12.5px] mt-1">
            Les raisons de départ apparaîtront ici dès la première résiliation.
          </p>
        </div>
      ) : (
        <>
          {/* Le classement des motifs : où chercher en premier. */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a1120] p-5">
            <p className="text-[12px] uppercase tracking-[0.09em] text-slate-600 font-inter mb-4">
              Motifs, du plus fréquent au moins fréquent
            </p>
            <div className="space-y-2.5">
              {classement.map(([raison, n]) => {
                const pct = Math.round((n / data.total) * 100);
                const actif = filtre === raison;
                return (
                  <button key={raison} onClick={() => setFiltre(actif ? null : raison)}
                    data-testid={`resil-filtre-${raison}`}
                    className="w-full flex items-center gap-3 text-left group">
                    <span className={`w-[168px] shrink-0 text-[13px] font-inter transition-colors
                                      ${actif ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                      {LIBELLES[raison] || raison}
                    </span>
                    <span className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <span className="block h-full rounded-full bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF]"
                        style={{ width: `${Math.max(pct, 3)}%` }} />
                    </span>
                    <span className="w-[62px] shrink-0 text-right text-[12.5px] text-slate-500 tabular-nums font-inter">
                      {n} · {pct} %
                    </span>
                  </button>
                );
              })}
            </div>
            {filtre && (
              <button onClick={() => setFiltre(null)}
                className="mt-4 text-[12.5px] text-[#8A6CFF] hover:underline font-inter">
                Voir tous les départs
              </button>
            )}
          </div>

          {/* Le détail : c'est là que se trouve ce qu'on ne pouvait pas prévoir. */}
          <div className="rounded-2xl border border-white/[0.06] bg-[#0a1120] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] font-inter">
                <thead>
                  <tr className="text-slate-600 text-[11.5px] uppercase tracking-[0.07em]">
                    <th className="text-left font-medium px-5 py-3">Date</th>
                    <th className="text-left font-medium px-2 py-3">Compte</th>
                    <th className="text-left font-medium px-2 py-3">Motif</th>
                    <th className="text-left font-medium px-2 py-3">Issue</th>
                    <th className="text-left font-medium px-5 py-3">Ce qu'il a écrit</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const [libelle, couleur] = ISSUES[l.issue] || ['—', '#94a3b8'];
                    return (
                      <tr key={l.id} className="border-t border-white/[0.05] align-top">
                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap tabular-nums">
                          {jour(l.created_at)}
                        </td>
                        <td className="px-2 py-3 min-w-[150px]">
                          <span className="block text-slate-200 truncate max-w-[190px]">{l.nom || '—'}</span>
                          <span className="block text-[11.5px] text-slate-600 truncate max-w-[190px]">{l.email}</span>
                        </td>
                        <td className="px-2 py-3 text-slate-300 whitespace-nowrap">
                          {LIBELLES[l.raison] || l.raison}
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap">
                          <span className="text-[11.5px] font-semibold px-2 py-0.5 rounded-full border"
                            style={{ color: couleur, borderColor: `${couleur}44`, background: `${couleur}14` }}>
                            {libelle}
                          </span>
                          {l.detail && (
                            <span className="block text-[11px] text-slate-600 mt-1">{l.detail}</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-400 max-w-[380px]">
                          {l.commentaire || <span className="text-slate-700">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
