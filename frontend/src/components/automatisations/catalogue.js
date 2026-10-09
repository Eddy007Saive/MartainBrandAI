import { Zap, MessageSquare, Hourglass, GitBranch, Timer, Split, Tag, Database, UserRound, Flag } from 'lucide-react';

/* Catalogue des blocs de l'éditeur d'automatisations. Chaque bloc correspond à un type de
   nœud Zernio (docs.zernio.com/workflows) ; `config` est envoyée telle quelle à Zernio.
   Non proposés pour l'instant : ai (clé du fournisseur à stocker chez Zernio), webhook,
   start_call (WhatsApp), enroll_sequence, set_variable. */

export const rid = (p = 'n') => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const BLOCS = {
  trigger: { icon: Zap, color: '#F59E0B', defaut: () => ({ triggerType: 'comment', comment: { keywords: [], matchType: 'contains' } }) },
  send_message: { icon: MessageSquare, color: '#8A6CFF', defaut: () => ({ messageType: 'text', text: '' }) },
  wait_for_reply: { icon: Hourglass, color: '#60A5FA', defaut: () => ({ timeoutMinutes: 1440, saveAs: 'reponse' }) },
  condition: { icon: GitBranch, color: '#E879F9', defaut: () => ({ rules: [{ id: rid('r'), variable: 'lastMessage', operator: 'contains', value: '' }] }) },
  delay: { icon: Timer, color: '#94A3B8', defaut: () => ({ delayMinutes: 60 }) },
  a_b_split: { icon: Split, color: '#F472B6', defaut: () => ({ percentage: 50 }) },
  add_tag: { icon: Tag, color: '#34D399', defaut: () => ({ tag: '' }) },
  remove_tag: { icon: Tag, color: '#F87171', defaut: () => ({ tag: '' }) },
  set_field: { icon: Database, color: '#22D3EE', defaut: () => ({ field: '', value: '' }) },
  handoff: { icon: UserRound, color: '#FB923C', terminal: true, defaut: () => ({ note: '' }) },
  end: { icon: Flag, color: '#64748B', terminal: true, defaut: () => ({}) },
};

/** Blocs ajoutables depuis la palette (le déclencheur est unique et toujours présent). */
export const PALETTE = ['send_message', 'wait_for_reply', 'condition', 'delay', 'a_b_split', 'add_tag', 'remove_tag', 'set_field', 'handoff', 'end'];

export const DECLENCHEURS = ['comment', 'inbound_message', 'story_mention'];
/** La mention en story n'existe que sur Instagram. */
export const declencheursPour = (platform) => DECLENCHEURS.filter((d) => d !== 'story_mention' || platform === 'instagram');

export const OPERATEURS = ['contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'exists', 'not_exists', 'has_tag', 'not_has_tag', 'is_true', 'is_false', 'greater_than', 'less_than'];
export const SANS_VALEUR = ['exists', 'not_exists', 'is_true', 'is_false'];

/** Variables utilisables dans les messages ({{…}}) et les conditions. */
export const VARIABLES = ['contact.name', 'contact.handle', 'lastMessage', 'comment.text', 'quickReply.payload', 'quickReply.title', 'postback.payload', 'contact.tags', 'contact.isFollower'];

/** Sorties d'un bloc : une par branche possible (id = sourceHandle Zernio, null = sortie
 * unique). Un bloc terminal n'en a pas. */
export function sorties(type, config = {}, t = (k) => k) {
  if (BLOCS[type]?.terminal) return [];
  if (type === 'condition') {
    return [
      ...(config.rules || []).map((r, i) => ({ id: r.id, label: t('auto.sortie.regle', { n: i + 1 }) })),
      { id: 'default', label: t('auto.sortie.sinon') },
    ];
  }
  if (type === 'wait_for_reply') return [{ id: 'reply', label: t('auto.sortie.reponse') }, { id: 'timeout', label: t('auto.sortie.silence') }];
  if (type === 'a_b_split') return [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  return [{ id: null, label: '' }];
}

const court = (s, n = 42) => {
  const v = String(s || '').replace(/\s+/g, ' ').trim();
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};

export const dureeLisible = (minutes, t) => {
  const m = Number(minutes) || 0;
  if (m && m % 1440 === 0) return t('auto.duree.jours', { count: m / 1440 });
  if (m && m % 60 === 0) return t('auto.duree.heures', { count: m / 60 });
  return t('auto.duree.minutes', { count: m });
};

/** Résumé d'une ligne affiché sur le bloc, pour lire le scénario sans l'ouvrir. */
export function resume(type, c = {}, t) {
  switch (type) {
    case 'trigger': {
      const mots = (c.triggerType === 'comment' ? c.comment?.keywords : c.keywords) || [];
      const base = t(`auto.declencheur.${c.triggerType || 'inbound_message'}`);
      const cible = c.triggerType === 'comment' && c.comment?.platformPostId ? ` · ${t('auto.post.unSeul')}` : '';
      return `${mots.length ? `${base} : ${mots.join(', ')}` : base}${cible}`;
    }
    case 'send_message': return court(c.text) || t('auto.resume.messageVide');
    case 'wait_for_reply': return t('auto.resume.attente', { duree: dureeLisible(c.timeoutMinutes, t) });
    case 'condition': return t('auto.resume.regles', { count: (c.rules || []).length });
    case 'delay': return dureeLisible(c.delayMinutes, t);
    case 'a_b_split': return `A ${c.percentage ?? 50} % · B ${100 - (c.percentage ?? 50)} %`;
    case 'add_tag':
    case 'remove_tag': return c.tag ? `#${c.tag}` : t('auto.resume.tagVide');
    case 'set_field': return c.field ? `${c.field} = ${court(c.value, 24)}` : t('auto.resume.champVide');
    case 'handoff': return court(c.note) || t('auto.resume.humain');
    default: return '';
  }
}

/* ---------- Modèles prêts à l'emploi ---------- */

const pos = (i, x = 0) => ({ x, y: i * 150 });
const n = (id, type, config, i, x) => ({ id, type, config, position: pos(i, x) });
const e = (source, target, sourceHandle) => ({ id: rid('e'), source, target, ...(sourceHandle ? { sourceHandle } : {}) });

export const MODELES = [
  {
    id: 'commentaire-dm',
    cle: 'commentaireDm',
    build: (t) => ({
      name: t('auto.modeles.commentaireDm.nom'),
      nodes: [
        n('t', 'trigger', { triggerType: 'comment', comment: { keywords: ['GUIDE'], matchType: 'contains' } }, 0),
        // Pas de bouton : en réponse privée à un commentaire, Instagram affiche une bulle
        // vide pour un message à boutons (constaté le 2026-10-07). Le lien va dans le texte.
        n('m', 'send_message', { messageType: 'text', text: `${t('auto.modeles.commentaireDm.message')} https://` }, 1),
        n('tag', 'add_tag', { tag: 'lead-guide' }, 2),
        n('fin', 'end', {}, 3),
      ],
      edges: [e('t', 'm'), e('m', 'tag'), e('tag', 'fin')],
    }),
  },
  {
    id: 'qualifier',
    cle: 'qualifier',
    build: (t) => ({
      name: t('auto.modeles.qualifier.nom'),
      nodes: [
        n('t', 'trigger', { triggerType: 'inbound_message', keywords: [], matchType: 'any', onlyFirstMessage: true, cooldownHours: 24 }, 0),
        n('q', 'send_message', {
          messageType: 'text', text: t('auto.modeles.qualifier.question'),
          quickReplies: [
            { title: t('auto.modeles.qualifier.devis'), payload: 'devis' },
            { title: t('auto.modeles.qualifier.info'), payload: 'info' },
          ],
        }, 1),
        n('w', 'wait_for_reply', { timeoutMinutes: 1440, saveAs: 'besoin' }, 2),
        n('c', 'condition', { rules: [{ id: 'r_devis', variable: 'quickReply.payload', operator: 'equals', value: 'devis' }] }, 3),
        n('tagd', 'add_tag', { tag: 'devis' }, 4, -170),
        n('h', 'handoff', { note: t('auto.modeles.qualifier.note') }, 5, -170),
        n('r', 'send_message', { messageType: 'text', text: t('auto.modeles.qualifier.reponseInfo') }, 4, 170),
        n('fin', 'end', {}, 5, 170),
        n('fin2', 'end', {}, 3, 340),
      ],
      edges: [e('t', 'q'), e('q', 'w'), e('w', 'c', 'reply'), e('w', 'fin2', 'timeout'), e('c', 'tagd', 'r_devis'), e('tagd', 'h'), e('c', 'r', 'default'), e('r', 'fin')],
    }),
  },
  {
    id: 'story',
    cle: 'story',
    instagram: true,
    build: (t) => ({
      name: t('auto.modeles.story.nom'),
      nodes: [
        n('t', 'trigger', { triggerType: 'story_mention', cooldownHours: 24 }, 0),
        n('m', 'send_message', { messageType: 'text', text: t('auto.modeles.story.message') }, 1),
        n('fin', 'end', {}, 2),
      ],
      edges: [e('t', 'm'), e('m', 'fin')],
    }),
  },
  {
    id: 'vide',
    cle: 'vide',
    build: (t) => ({
      name: t('auto.modeles.vide.nom'),
      nodes: [n('t', 'trigger', { triggerType: 'inbound_message', keywords: [], matchType: 'contains', onlyFirstMessage: false }, 0)],
      edges: [],
    }),
  },
];

/* ---------- Rangement automatique ---------- */

const LARGEUR_BLOC = 230;
const ECART_X = 50;
const PAS_Y = 150;

/**
 * Range les blocs en arbre, de haut en bas : le déclencheur en haut, chaque branche sous
 * son bloc, dans l'ordre de ses sorties (règles puis « Sinon », Réponse puis Silence, A
 * puis B). Un bloc atteint par plusieurs chemins est placé sous le premier qui l'atteint ;
 * les blocs isolés (non reliés) vont dans une colonne à droite.
 * Renvoie { id: { x, y } }.
 */
export function rangerArbre(nodes, edges) {
  const parId = new Map(nodes.map((nd) => [nd.id, nd]));
  const ordreSortie = (nd, handle) => {
    const outs = sorties(nd.data.kind, nd.data.config);
    const i = outs.findIndex((o) => (o.id ?? null) === (handle ?? null));
    return i < 0 ? outs.length : i;
  };
  // Enfants de chaque bloc, triés par l'ordre de ses sorties.
  const enfants = new Map(nodes.map((nd) => [nd.id, []]));
  for (const ed of edges) {
    if (!parId.has(ed.source) || !parId.has(ed.target)) continue;
    enfants.get(ed.source).push(ed);
  }
  for (const [id, liste] of enfants) {
    const nd = parId.get(id);
    liste.sort((a, b) => ordreSortie(nd, a.sourceHandle) - ordreSortie(nd, b.sourceHandle));
  }

  const vus = new Set();
  const arbre = new Map(); // id -> ids des enfants dans l'arbre
  const construire = (id) => {
    vus.add(id);
    const fils = [];
    for (const ed of enfants.get(id) || []) {
      if (vus.has(ed.target)) continue;
      fils.push(ed.target);
      construire(ed.target);
    }
    arbre.set(id, fils);
  };
  const racine = nodes.find((nd) => nd.data.kind === 'trigger');
  if (racine) construire(racine.id);

  // Largeur (en colonnes) de chaque sous-arbre, puis placement centré sur ses enfants.
  const largeur = new Map();
  const mesurer = (id) => {
    const fils = arbre.get(id) || [];
    const l = fils.length ? fils.reduce((s, f) => s + mesurer(f), 0) : 1;
    largeur.set(id, l);
    return l;
  };
  const positions = {};
  const COL = LARGEUR_BLOC + ECART_X;
  const placer = (id, gauche, prof) => {
    const fils = arbre.get(id) || [];
    positions[id] = { x: Math.round(gauche + ((largeur.get(id) - 1) * COL) / 2), y: prof * PAS_Y };
    let x = gauche;
    for (const f of fils) {
      placer(f, x, prof + 1);
      x += largeur.get(f) * COL;
    }
  };
  let largeurTotale = 0;
  if (racine) {
    largeurTotale = mesurer(racine.id);
    placer(racine.id, 0, 0);
  }
  // Blocs non reliés au déclencheur : une colonne à droite.
  let rang = 0;
  for (const nd of nodes) {
    if (positions[nd.id]) continue;
    positions[nd.id] = { x: (largeurTotale + 0.5) * COL, y: rang * PAS_Y };
    rang += 1;
  }
  return positions;
}
