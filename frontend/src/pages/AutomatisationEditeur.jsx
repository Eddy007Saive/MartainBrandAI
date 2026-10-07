import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useEdgesState, useNodesState, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, Loader2, Save, Play, Pause, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import NoeudBloc from '../components/automatisations/NoeudBloc';
import Inspecteur from '../components/automatisations/Inspecteur';
import { BLOCS, MODELES, PALETTE, rid } from '../components/automatisations/catalogue';
import { SocialIcon } from '../components/SocialIcon';
import { messageErreur, workflowService } from '../services/workflowService';

const TYPES_NOEUDS = { bloc: NoeudBloc };

/* Conversion entre le format Zernio ({ id, type, config, position, label }) et celui de
   React Flow ({ id, type: 'bloc', position, data }). */
const versCanevas = (nodes = []) => nodes.map((nd, i) => ({
  id: nd.id,
  type: 'bloc',
  position: nd.position || { x: 0, y: i * 150 },
  deletable: nd.type !== 'trigger',
  data: { kind: nd.type, config: nd.config || {}, label: nd.label || '' },
}));
const aretesCanevas = (edges = []) => edges.map((ed) => ({ ...ed, id: ed.id || rid('e'), sourceHandle: ed.sourceHandle ?? null }));

const versZernio = (nodes, edges) => ({
  nodes: nodes.map((nd) => {
    const config = { ...nd.data.config };
    // Une réponse rapide sans valeur reçoit sinon une valeur interne Zernio : une condition
    // sur {{quickReply.payload}} ne pourrait plus la reconnaître. On reprend son titre.
    if (Array.isArray(config.quickReplies)) {
      config.quickReplies = config.quickReplies.filter((q) => q.title).map((q) => ({ ...q, payload: q.payload || q.title }));
    }
    if (Array.isArray(config.buttons)) config.buttons = config.buttons.filter((b) => b.title && b.url);
    return {
      id: nd.id,
      type: nd.data.kind,
      config,
      position: { x: Math.round(nd.position.x), y: Math.round(nd.position.y) },
      ...(nd.data.label ? { label: nd.data.label } : {}),
    };
  }),
  edges: edges.map((ed) => ({ id: ed.id, source: ed.source, target: ed.target, ...(ed.sourceHandle ? { sourceHandle: ed.sourceHandle } : {}) })),
});

const STYLE_ARETE = { stroke: '#64748b', strokeWidth: 1.6 };

function Editeur() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const nouveau = !id || id === 'nouveau';
  const rf = useReactFlow();
  const canevasRef = useRef(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nom, setNom] = useState('');
  const [comptes, setComptes] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [statut, setStatut] = useState('draft');
  const [workflowId, setWorkflowId] = useState(nouveau ? null : id);
  const [selection, setSelection] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        if (nouveau) {
          const { comptes: cs } = await workflowService.lister();
          if (!vivant) return;
          setComptes(cs || []);
          const premier = (cs || [])[0];
          setAccountId(premier?.accountId || '');
          const modele = MODELES.find((m) => m.id === params.get('modele')) || MODELES[MODELES.length - 1];
          const g = modele.build(t);
          setNom(g.name);
          setNodes(versCanevas(g.nodes));
          setEdges(aretesCanevas(g.edges));
          setModifie(true);
        } else {
          const { workflow, comptes: cs } = await workflowService.obtenir(id);
          if (!vivant) return;
          setComptes(cs || []);
          setAccountId(workflow.accountId);
          setNom(workflow.name || '');
          setStatut(workflow.status);
          setNodes(versCanevas(workflow.nodes));
          setEdges(aretesCanevas(workflow.edges));
        }
      } catch (e) {
        toast.error(messageErreur(e, t('auto.erreur.chargement')));
        navigate('/dashboard/automatisations');
      } finally {
        if (vivant) setChargement(false);
      }
    })();
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { if (!chargement) setTimeout(() => rf.fitView({ padding: 0.25, maxZoom: 1 }), 50); }, [chargement, rf]);

  const compte = comptes.find((c) => c.accountId === accountId);
  const platform = compte?.platform || 'instagram';
  const noeudSel = nodes.find((nd) => nd.id === selection) || null;

  // Variables créées par les blocs « Attendre une réponse » (saveAs), proposées partout.
  const extras = useMemo(() => nodes.filter((nd) => nd.data.kind === 'wait_for_reply' && nd.data.config.saveAs).map((nd) => nd.data.config.saveAs), [nodes]);
  const apresCommentaire = useMemo(() => {
    const trig = nodes.find((nd) => nd.data.kind === 'trigger');
    if (!noeudSel || trig?.data.config.triggerType !== 'comment') return false;
    return edges.some((ed) => ed.source === trig.id && ed.target === noeudSel.id);
  }, [nodes, edges, noeudSel]);

  const marquer = () => setModifie(true);

  const onConnect = useCallback((c) => {
    // Une sortie ne mène qu'à un seul bloc : relier à nouveau remplace l'ancien lien.
    setEdges((eds) => addEdge({ ...c, id: rid('e') }, eds.filter((ed) => !(ed.source === c.source && (ed.sourceHandle ?? null) === (c.sourceHandle ?? null)))));
    marquer();
  }, [setEdges]);

  const majNoeud = (nid, patch) => {
    setNodes((nds) => nds.map((nd) => (nd.id === nid ? { ...nd, data: { ...nd.data, ...patch } } : nd)));
    marquer();
  };

  const ajouter = (kind) => {
    const bord = canevasRef.current?.getBoundingClientRect();
    let position = rf.screenToFlowPosition({ x: (bord?.left || 0) + (bord?.width || 600) / 2, y: (bord?.top || 0) + (bord?.height || 400) / 2 });
    const depuis = noeudSel && !BLOCS[noeudSel.data.kind]?.terminal ? noeudSel : null;
    if (depuis) position = { x: depuis.position.x, y: depuis.position.y + 150 };
    const nid = rid('n');
    setNodes((nds) => [...nds.map((nd) => ({ ...nd, selected: false })), { id: nid, type: 'bloc', position, selected: true, data: { kind, config: BLOCS[kind].defaut(), label: '' } }]);
    // Relie automatiquement au bloc sélectionné s'il a une sortie libre (sortie unique).
    if (depuis && !['condition', 'wait_for_reply', 'a_b_split'].includes(depuis.data.kind) && !edges.some((ed) => ed.source === depuis.id)) {
      setEdges((eds) => [...eds, { id: rid('e'), source: depuis.id, target: nid, sourceHandle: null }]);
    }
    setSelection(nid);
    setPalette(false);
    marquer();
  };

  const supprimerSel = () => {
    if (!noeudSel || noeudSel.data.kind === 'trigger') return;
    setNodes((nds) => nds.filter((nd) => nd.id !== noeudSel.id));
    setEdges((eds) => eds.filter((ed) => ed.source !== noeudSel.id && ed.target !== noeudSel.id));
    setSelection(null);
    marquer();
  };

  const enregistrer = async () => {
    if (!accountId) { toast.error(t('auto.erreur.compte')); return null; }
    if (!nom.trim()) { toast.error(t('auto.erreur.nom')); return null; }
    setEnCours(true);
    try {
      const graphe = versZernio(nodes, edges);
      let wid = workflowId;
      if (wid) {
        const r = await workflowService.modifier(wid, { name: nom.trim(), accountId, ...graphe });
        if (r.workflow?.status) setStatut(r.workflow.status);
      } else {
        const r = await workflowService.creer({ name: nom.trim(), accountId, ...graphe });
        wid = r.workflow.id;
        setWorkflowId(wid);
        navigate(`/dashboard/automatisations/${wid}`, { replace: true });
      }
      setModifie(false);
      toast.success(t('auto.enregistre'));
      return wid;
    } catch (e) {
      if (!e.__handled) toast.error(messageErreur(e, t('auto.erreur.enregistrement')), { duration: 9000 });
      return null;
    } finally {
      setEnCours(false);
    }
  };

  const basculer = async () => {
    let wid = workflowId;
    if (modifie || !wid) {
      wid = await enregistrer();
      if (!wid) return;
    }
    setEnCours(true);
    try {
      const r = statut === 'active' ? await workflowService.pause(wid) : await workflowService.activer(wid);
      setStatut(r.workflow?.status || (statut === 'active' ? 'paused' : 'active'));
      toast.success(statut === 'active' ? t('auto.misEnPause') : t('auto.active'));
    } catch (e) {
      if (!e.__handled) toast.error(messageErreur(e, t('auto.erreur.activation')), { duration: 9000 });
    } finally {
      setEnCours(false);
    }
  };

  if (chargement) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-[#5B6CFF]" /></div>;
  }

  const actif = statut === 'active';
  const Palette = (
    <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
      {PALETTE.map((k) => {
        const B = BLOCS[k];
        return (
          <button key={k} type="button" onClick={() => ajouter(k)} data-testid={`auto-ajouter-${k}`}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15 text-left">
            <span className="w-6 h-6 rounded-md grid place-items-center shrink-0" style={{ background: `${B.color}22` }}><B.icon className="w-3.5 h-3.5" style={{ color: B.color }} /></span>
            <span className="text-[12.5px] text-slate-200 truncate">{t(`auto.bloc.${k}`)}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] min-h-[520px] -mb-6 gap-3">
      {/* Barre du haut */}
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/dashboard/automatisations" className="w-9 h-9 grid place-items-center rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white" aria-label={t('auto.retour')}>
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <input value={nom} onChange={(e) => { setNom(e.target.value); marquer(); }} maxLength={120} data-testid="auto-nom"
          className="flex-1 min-w-[160px] h-9 bg-transparent border-b border-transparent hover:border-white/10 focus:border-[#8A6CFF]/60 focus:outline-none text-white font-sora font-semibold text-[16px]" />
        <div className="flex items-center gap-1.5">
          {compte && <SocialIcon network={platform} className="w-4 h-4 text-slate-300" />}
          <select value={accountId} onChange={(e) => { setAccountId(e.target.value); marquer(); }} data-testid="auto-compte"
            className="h-9 rounded-lg bg-white/[0.04] border border-white/10 px-2 text-[12.5px] text-white focus:outline-none">
            {comptes.map((c) => <option key={c.accountId} value={c.accountId} className="bg-[#0f172a]">{c.platform === 'instagram' ? 'Instagram' : 'Facebook'}</option>)}
          </select>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold border ${actif ? 'text-[#3AFFA3] border-[#3AFFA3]/30 bg-[#3AFFA3]/10' : 'text-slate-400 border-white/10 bg-white/[0.03]'}`}>
          {t(`auto.statut.${statut}`)}
        </span>
        <button type="button" onClick={enregistrer} disabled={enCours || (!modifie && !!workflowId)} data-testid="auto-enregistrer"
          className="h-9 px-3.5 flex items-center gap-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-[13px] text-white hover:bg-white/[0.1] disabled:opacity-40">
          {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{t('auto.enregistrer')}
        </button>
        <button type="button" onClick={basculer} disabled={enCours} data-testid="auto-activer"
          className={`h-9 px-3.5 flex items-center gap-1.5 rounded-xl text-[13px] font-semibold disabled:opacity-40 ${actif ? 'bg-amber-500/15 text-amber-200 border border-amber-500/30' : 'bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white'}`}>
          {actif ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}{actif ? t('auto.pause') : t('auto.activer')}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex gap-3 relative">
        {/* Palette (ordinateur) */}
        <aside className="hidden lg:flex flex-col w-[200px] shrink-0 rounded-2xl border border-white/[0.06] bg-[#0f172a] p-3 overflow-y-auto">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">{t('auto.blocs')}</p>
          {Palette}
          <p className="text-[11px] text-slate-500 mt-3 leading-snug">{t('auto.aide.palette')}</p>
        </aside>

        {/* Canevas */}
        <div ref={canevasRef} className="flex-1 min-w-0 rounded-2xl border border-white/[0.06] bg-[#0b1120] overflow-hidden relative" data-testid="auto-canevas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={TYPES_NOEUDS}
            onNodesChange={(ch) => { onNodesChange(ch); if (ch.some((c) => c.type === 'position' && c.dragging === false) || ch.some((c) => c.type === 'remove')) marquer(); }}
            onEdgesChange={(ch) => { onEdgesChange(ch); if (ch.some((c) => c.type === 'remove')) marquer(); }}
            onConnect={onConnect}
            onSelectionChange={({ nodes: sel }) => setSelection(sel[0]?.id || null)}
            onNodesDelete={() => setSelection(null)}
            defaultEdgeOptions={{ style: STYLE_ARETE, type: 'smoothstep' }}
            colorMode="dark"
            style={{ background: '#0b1120' }}
            fitView
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background color="rgba(255,255,255,0.06)" bgColor="#0b1120" gap={20} />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable className="!hidden md:!block" maskColor="rgba(2,6,23,0.7)" nodeColor={(nd) => BLOCS[nd.data?.kind]?.color || '#64748b'} />
          </ReactFlow>
          {/* Ajouter un bloc (mobile / tablette) */}
          <button type="button" onClick={() => setPalette(true)} data-testid="auto-palette-mobile"
            className="lg:hidden absolute top-3 right-3 z-10 h-9 px-3 flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#5B6CFF] to-[#8A6CFF] text-white text-[13px] font-semibold shadow-lg">
            <Plus className="w-4 h-4" />{t('auto.ajouterBloc')}
          </button>
        </div>

        {/* Réglages du bloc : colonne sur ordinateur, panneau du bas sur mobile */}
        {noeudSel && (
          <aside className="fixed inset-x-0 bottom-0 z-40 max-h-[75dvh] rounded-t-2xl border-t border-white/10 bg-[#0f172a] shadow-2xl
            lg:static lg:z-auto lg:max-h-none lg:w-[320px] lg:shrink-0 lg:rounded-2xl lg:border lg:border-white/[0.06] lg:shadow-none overflow-hidden flex flex-col">
            <Inspecteur
              key={noeudSel.id}
              noeud={noeudSel}
              platform={platform}
              accountId={accountId}
              extras={extras}
              apresCommentaire={apresCommentaire}
              onConfig={(config) => majNoeud(noeudSel.id, { config })}
              onLabel={(label) => majNoeud(noeudSel.id, { label })}
              onSupprimer={supprimerSel}
              onFermer={() => { setSelection(null); setNodes((nds) => nds.map((nd) => ({ ...nd, selected: false }))); }}
            />
          </aside>
        )}
      </div>

      {palette && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setPalette(false)}>
          <div className="w-full rounded-t-2xl bg-[#0f172a] border-t border-white/10 p-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[14px] font-semibold text-white font-sora">{t('auto.ajouterBloc')}</p>
              <button type="button" onClick={() => setPalette(false)} className="w-8 h-8 grid place-items-center text-slate-400" aria-label={t('auto.fermer')}><X className="w-4 h-4" /></button>
            </div>
            {Palette}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AutomatisationEditeur() {
  return (
    <ReactFlowProvider>
      <Editeur />
    </ReactFlowProvider>
  );
}
