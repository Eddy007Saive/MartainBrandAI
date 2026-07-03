import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { onboardingService } from '../services/onboardingService';

const MAX_FILE_MB = 5;
const MAX_IMAGES = 6;
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

/* ---------- SOURCE DE VÉRITÉ : tout le formulaire ---------- */
const FORM = [
  { id: 'identite', title: 'Identité & entreprise', sub: 'On commence par les bases : qui tu es et ce que tu fais.', fields: [
    { id: 'marque', label: 'Nom de la marque / entreprise', type: 'text', req: 1, ph: 'Le nom sous lequel tu communiques' },
    { id: 'dirigeant', label: 'Ton nom et prénom', type: 'text', req: 1, ph: 'Celui qui incarne la marque' },
    { id: 'site', label: 'Site web ou lien principal', type: 'text', ph: 'https://…' },
    { id: 'secteur', label: "Ton secteur d'activité, en une phrase", type: 'text', req: 1, help: 'Précis. Le métier exact, pas la catégorie large.', ph: 'Ex : Coach en nutrition sportive pour femmes actives' },
    { id: 'anciennete', label: "Depuis quand l'entreprise existe", type: 'text', ph: 'Ex : 2021' },
    { id: 'zone', label: 'Ta zone géographique / tes marchés', type: 'text', ph: 'Ex : France, ou « en ligne, partout »' },
    { id: 'pitch', label: 'En une phrase simple : que fais-tu, pour qui ?', type: 'textarea', req: 1, help: "Comme si tu l'expliquais à un inconnu en soirée.", ph: "Ex : J'aide les [clients] à [résultat] grâce à [méthode]." },
  ] },

  { id: 'offre', title: 'Offre & positionnement', sub: 'Ce que tu vends, et pourquoi on devrait te choisir toi.', fields: [
    { id: 'produits', label: 'Que vends-tu concrètement ? (produits / services)', type: 'textarea', req: 1, ph: 'Liste tes offres principales, en quelques lignes.' },
    { id: 'valeur', label: 'Ta proposition de valeur en une phrase', type: 'textarea', req: 1, help: 'Le bénéfice n°1 que tu apportes.', ph: 'Le résultat concret que ton client obtient grâce à toi.' },
    { id: 'diff', label: "Qu'est-ce qui te rend différent ? (3 choses)", type: 'textarea', req: 1, help: 'Ce que les autres ne font pas, ou pas comme toi.', ph: '1.\n2.\n3.' },
    { id: 'concurrents', label: 'Tes 2-3 concurrents ou alternatives', type: 'text', help: "On ne les citera jamais — c'est juste pour situer ton marché.", ph: 'Ex : autres logiciels, agences, faire soi-même' },
    { id: 'histoire', label: 'Pourquoi as-tu lancé cette entreprise ? Ton histoire', type: 'textarea', help: "Le « pourquoi » derrière le projet. C'est souvent l'or de ta communication.", ph: "Le déclic, le problème vécu, la galère qui t'a poussé à créer ça…" },
    { id: 'position', label: 'Ton positionnement prix', type: 'radio', options: ['Premium / haut de gamme', 'Milieu de gamme', 'Accessible / agressif', 'Sur-mesure / variable'] },
  ] },

  { id: 'cible', title: 'Ton client idéal', sub: "Pour parler juste, l'IA doit connaître à qui elle s'adresse.", fields: [
    { id: 'persona', label: 'Décris ton client idéal', type: 'textarea', req: 1, help: 'Qui est-il ? Métier, âge, situation, niveau…', ph: 'Ex : entrepreneur solo, 30-45 ans, déjà du chiffre mais débordé, veut structurer sans s\'épuiser.' },
    { id: 'douleurs', label: 'Ses 3 plus grosses frustrations / problèmes', type: 'textarea', req: 1, ph: '1.\n2.\n3.' },
    { id: 'desir', label: "Ce qu'il veut vraiment obtenir", type: 'textarea', help: 'Au-delà du produit : son objectif profond.', ph: 'Ex : reprendre le contrôle, scaler sans s\'épuiser, construire un actif qui vaut quelque chose.' },
    { id: 'objections', label: "Ses freins / objections avant d'acheter", type: 'textarea', help: 'Ce qui le retient de dire oui.', ph: 'Ex : « j\'ai déjà mes outils », « c\'est cher », « je n\'ai pas le temps de migrer »…' },
    { id: 'vocabulaire', label: 'Comment parle-t-il ? Ses mots, ses expressions', type: 'textarea', help: "Le jargon de ton client. L'IA s'en servira pour sonner naturel.", ph: 'Mots du métier, tournures, expressions qu\'il utilise vraiment.' },
  ] },

  { id: 'voix', title: 'Voix & ton', sub: 'Le cœur de la config : comment tu sonnes.', fields: [
    { id: 'adresse', label: "Tu t'adresses à ton audience en…", type: 'radio', req: 1, options: ['Tutoiement', 'Vouvoiement', 'Ça dépend du réseau'] },
    { id: 'adjectifs', label: '3 à 5 adjectifs qui décrivent ton ton', type: 'text', req: 1, help: "Le caractère de ta marque à l'écrit.", ph: 'Ex : direct, chaleureux, sans bullshit, expert, cash' },
    { id: 'langage', label: 'Niveau de langage', type: 'radio', options: ['Familier / parlé', 'Pro mais accessible', 'Expert / technique', 'Premium / sobre'] },
    { id: 'emojis', label: 'Émojis ?', type: 'radio', options: ['Beaucoup, ça fait partie du style', 'Avec parcimonie', 'Jamais'] },
    { id: 'phrases', label: 'Style de phrases', type: 'radio', options: ['Courtes, punchy, rythmées', 'Développées, posées', 'Un mix des deux'] },
    { id: 'personne', label: 'Si ta marque était une personne, qui serait-elle ?', type: 'textarea', help: 'Un personnage, un type de mentor, une ambiance. Très utile pour calibrer le ton.', ph: 'Ex : le grand frère entrepreneur qui te dit la vérité sans te ménager.' },
    { id: 'inspirations_ton', label: "Des créateurs / marques dont tu aimes le style d'écriture", type: 'textarea', help: "On s'en inspire pour le ton (jamais pour copier).", ph: 'Noms de comptes, de marques, de personnes…' },
  ] },

  { id: 'piliers', title: 'Piliers de contenu', sub: 'Tes grands sujets récurrents — ce dont tu parles tout le temps.', fields: [
    { id: 'themes', label: 'Tes 3 à 5 grands thèmes récurrents', type: 'textarea', req: 1, help: 'Un par ligne. Ce sont tes « piliers ».', ph: 'Ex :\nMindset & confiance\nMéthode / coulisses\nÉtudes de cas clients\nMon vécu d\'entrepreneur' },
    { id: 'reference', label: 'Sur quel sujet veux-tu être LA référence ?', type: 'text', help: "Le terrain où tu veux qu'on pense à toi en premier.", ph: 'Ton domaine d\'expertise n°1' },
    { id: 'message', label: 'Que veux-tu que les gens retiennent de toi ?', type: 'textarea', help: 'Ton message de fond, ta conviction profonde.', ph: 'Ta phrase signature, ta croyance forte.' },
    { id: 'opinions', label: 'Des opinions tranchées que tu assumes', type: 'textarea', help: 'Les avis clivants font les meilleurs contenus.', ph: 'Ce sur quoi tu n\'es pas d\'accord avec ton secteur.' },
  ] },

  { id: 'eviter', title: 'Lignes rouges', sub: "Ce que l'IA ne devra jamais faire. Aussi important que le reste.", fields: [
    { id: 'mots_bannis', label: 'Mots / expressions à bannir', type: 'textarea', help: 'Le vocabulaire qui ne te ressemble pas.', ph: 'Ex : « disruptif », jargon corporate, anglicismes inutiles…' },
    { id: 'tons_eviter', label: 'Tons à éviter absolument', type: 'text', ph: 'Ex : moralisateur, vendeur agressif, niais, hype' },
    { id: 'tabous', label: 'Sujets tabous / interdits', type: 'textarea', help: "Ce qu'on ne touche pas.", ph: 'Politique, religion, sujets sensibles de ton secteur…' },
    { id: 'promesses', label: 'Promesses que tu ne feras JAMAIS', type: 'textarea', help: 'Important pour rester crédible et conforme.', ph: 'Ex : pas de résultats chiffrés garantis, pas de « x10 en 30 jours »…' },
    { id: 'legal', label: 'Contraintes légales / réglementaires', type: 'textarea', help: 'Mentions obligatoires, secteur réglementé, etc.', ph: "S'il y a des règles de conformité à respecter." },
  ] },

  { id: 'hooks', title: "Accroches & appels à l'action", sub: "Ce qui fait s'arrêter, et ce qui fait passer à l'action.", fields: [
    { id: 'hooks_ok', label: 'Tes meilleures accroches (hooks) qui ont marché', type: 'textarea', help: "Une par ligne. L'IA s'en inspire pour ouvrir les posts.", ph: 'Ex :\nPendant 2 ans, j\'ai bradé mes prix…\n90% des [clients] font cette erreur\nPersonne ne te dira ça, mais…' },
    { id: 'cta', label: "Tes appels à l'action habituels", type: 'textarea', help: 'Une par ligne. Ce que tu demandes au lecteur de faire.', ph: 'Ex :\nCommente le mot [X]\nLien en bio\nDM-moi pour en parler' },
    { id: 'offres_push', label: 'Liens / offres à pousser régulièrement', type: 'textarea', ph: 'Lead magnet, audit gratuit, page de vente, mot-clé ManyChat…' },
  ] },

  { id: 'regles', title: 'Règles éditoriales', sub: 'Ta « bible » : les règles que l\'IA respectera à la lettre.', fields: [
    { id: 'bible', label: 'Tes règles strictes', type: 'textarea', help: 'Tout ce qui prime sur le reste. Structure, ce qui est interdit, dosage des CTA…', ph: 'Ex :\n1. Un seul CTA par post.\n2. Toujours un pilier + un hook.\n3. Jamais de promesses chiffrées garanties.' },
    { id: 'structure_post', label: 'Ta structure de post préférée', type: 'textarea', help: 'Comment tu construis un post qui marche.', ph: 'Ex : hook → histoire/preuve → leçon → CTA' },
    { id: 'cta_nombre', label: 'Combien de CTA par post ?', type: 'radio', options: ['Un seul, toujours', 'Selon le contexte', 'Plusieurs OK'] },
    { id: 'hashtags', label: 'Hashtags ?', type: 'radio', options: ['Oui, beaucoup', 'Quelques-uns ciblés', 'Aucun'] },
  ] },

  { id: 'exemples', title: 'Tes meilleurs contenus', sub: 'Le plus précieux pour calibrer : colle tes vrais posts. Optionnel mais fortement recommandé.', fields: [
    { id: 'ex_linkedin', label: '1 à 3 de tes meilleurs posts', type: 'tabs' },
  ] },

  { id: 'reseaux', title: 'Réseaux & rythme', sub: 'Où tu publies, et à quelle fréquence.', fields: [
    { id: 'plateformes', label: 'Sur quels réseaux veux-tu publier ?', type: 'text', req: 1, ph: 'Ex : LinkedIn, Instagram, Facebook, TikTok' },
    { id: 'profils', label: 'Liens de tes profils existants', type: 'textarea', help: "Pour qu'on récupère ton style et ton historique.", ph: 'Un lien par ligne.' },
    { id: 'frequence', label: 'Fréquence de publication souhaitée', type: 'radio', options: ['1-2 / semaine', '3-4 / semaine', '1 / jour', 'Plusieurs / jour'] },
    { id: 'creneaux', label: 'Jours / créneaux préférés', type: 'text', ph: 'Ex : en semaine le matin, pas le week-end' },
  ] },

  { id: 'visuel', title: 'Identité visuelle', sub: 'Tes couleurs et ton style pour les visuels générés.', fields: [
    { id: 'col1', label: 'Couleur principale', type: 'color', default: '#2B7BFF' },
    { id: 'col2', label: 'Couleur secondaire', type: 'color', default: '#0A4FCC' },
    { id: 'col3', label: 'Couleur accent', type: 'color', default: '#3AFFA3' },
    { id: 'charte', label: 'Ton logo', type: 'file', help: 'Importe ton logo (PNG, JPG, SVG, WebP — 5 Mo max).' },
    { id: 'style_visuel', label: 'Le style visuel que tu aimes', type: 'textarea', help: 'Ambiance générale de tes visuels.', ph: 'Ex : épuré, premium, sombre, beaucoup d\'espace, peu de texte…' },
    { id: 'polices', label: 'Polices utilisées (si tu en as)', type: 'text', ph: 'Ex : Space Grotesk, Inter' },
    { id: 'inspis_visuel', label: '2-3 comptes dont tu adores le visuel', type: 'textarea', help: "On s'inspire de la composition et de l'ambiance.", ph: 'Noms de comptes ou liens.' },
    { id: 'visuels_upload', label: 'Visuels que tu aimes (upload)', type: 'files', help: `Importe des exemples de visuels — ${MAX_IMAGES} images max, ${MAX_FILE_MB} Mo chacune.` },
  ] },

  { id: 'objectifs', title: 'Objectifs', sub: "Pour finir : ce que tu veux que tout ça t'apporte.", fields: [
    { id: 'objectif', label: 'Objectif n°1 de tes réseaux', type: 'radio', req: 1, options: ['Notoriété / image', 'Générer des leads', 'Vendre directement', 'Recruter', 'Tout ça à la fois'] },
    { id: 'succes', label: 'Comment mesures-tu le succès ?', type: 'text', ph: 'Ex : nombre de leads qualifiés, DM reçus, audits réservés…' },
    { id: 'libre', label: 'Un mot pour la fin / tout contexte utile', type: 'textarea', help: "Tout ce qu'on n'a pas demandé et qui compte pour toi.", ph: 'Champ libre.' },
  ] },
];

const TABS = ['LinkedIn', 'Instagram', 'Facebook', 'TikTok'];

const num = (i) => String(i + 1).padStart(2, '0');

export default function AuditMarque() {
  // Valeurs initiales : les couleurs sont préremplies
  const [answers, setAnswers] = useState(() => {
    const init = {};
    FORM.forEach((s) => s.fields.forEach((f) => { if (f.type === 'color') init[f.id] = f.default; }));
    return init;
  });
  const [tabIdx, setTabIdx] = useState({});      // {fieldId: index onglet actif}
  const [active, setActive] = useState(FORM[0].id);
  const [senderEmail, setSenderEmail] = useState('');
  const [emailErr, setEmailErr] = useState(false);
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState(null);       // {type, recap}
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState({}); // {fieldId: bool}
  const [tsToken, setTsToken] = useState('');      // token Turnstile
  const hpRef = useRef('');                        // honeypot
  const tsRef = useRef(null);                      // conteneur widget Turnstile
  const tsWidget = useRef(null);                   // id du widget rendu

  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  const val = (id) => { const v = answers[id]; return typeof v === 'string' ? v.trim() : ''; };

  /* ---------- UPLOADS (logo / images) avec limites de capacité ---------- */
  const doUpload = async (f, fileList) => {
    const multiple = f.type === 'files';
    let files = Array.from(fileList || []);
    if (!files.length) return;
    const kind = f.id === 'charte' ? 'logo' : 'image';

    if (multiple) {
      const existing = answers[f.id] || [];
      const room = MAX_IMAGES - existing.length;
      if (room <= 0) { toast.error(`${MAX_IMAGES} images maximum.`); return; }
      if (files.length > room) { toast.error(`${MAX_IMAGES} images maximum — seules les ${room} premières sont ajoutées.`); files = files.slice(0, room); }
    } else {
      files = files.slice(0, 1);
    }

    const valid = files.filter((file) => {
      if (!file.type.startsWith('image/')) { toast.error(`« ${file.name} » n'est pas une image.`); return false; }
      if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`« ${file.name} » dépasse ${MAX_FILE_MB} Mo.`); return false; }
      return true;
    });
    if (!valid.length) return;

    setUploading((u) => ({ ...u, [f.id]: true }));
    try {
      for (const file of valid) {
        const { url } = await onboardingService.uploadAsset(file, kind);
        if (multiple) setAnswers((a) => ({ ...a, [f.id]: [...(a[f.id] || []), url] }));
        else setAnswers((a) => ({ ...a, [f.id]: url }));
      }
    } catch (e) {
      const msg = e?.response?.status === 429 ? "Trop d'envois, réessaie dans quelques minutes." : "Échec de l'upload. Réessaie.";
      toast.error(msg);
    } finally {
      setUploading((u) => ({ ...u, [f.id]: false }));
    }
  };

  const removeUpload = (f, url) => {
    if (f.type === 'files') setAnswers((a) => ({ ...a, [f.id]: (a[f.id] || []).filter((u) => u !== url) }));
    else setAnswers((a) => { const n = { ...a }; delete n[f.id]; return n; });
  };

  /* ---------- PROGRESSION ---------- */
  const fieldFilled = (f) => {
    if (f.type === 'color') return false;            // couleurs préremplies, ne comptent pas
    if (f.type === 'tabs') return TABS.some((t) => val(`${f.id}_${t.toLowerCase()}`));
    if (f.type === 'file') return !!answers[f.id];
    if (f.type === 'files') return (answers[f.id] || []).length > 0;
    return !!val(f.id);
  };
  const sectionFilled = (sec) => sec.fields.some(fieldFilled);

  const done = useMemo(() => FORM.filter(sectionFilled).length, [answers]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = Math.round((done / FORM.length) * 100);

  /* ---------- SCROLLSPY ---------- */
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: '-40% 0px -55% 0px' });
    FORM.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  /* ---------- CLOUDFLARE TURNSTILE ---------- */
  useEffect(() => {
    const render = () => {
      if (window.turnstile && tsRef.current && tsWidget.current == null) {
        tsWidget.current = window.turnstile.render(tsRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          callback: (t) => setTsToken(t),
          'expired-callback': () => setTsToken(''),
          'error-callback': () => setTsToken(''),
        });
      }
    };
    if (window.turnstile) { render(); return undefined; }
    let script = document.querySelector('script[data-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true; script.defer = true; script.setAttribute('data-turnstile', '1');
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    return () => script && script.removeEventListener('load', render);
  }, []);

  /* ---------- RÉCAP ---------- */
  const buildRecap = () => {
    const lines = [];
    const sep = '═══════════════════════════════════════════';
    lines.push(sep);
    lines.push('AUDIT DE MARQUE — ONBOARDING PRESENCE OS');
    lines.push('Marque : ' + (val('marque') || '—'));
    lines.push('Date : ' + new Date().toLocaleDateString('fr-FR'));
    lines.push(sep);
    FORM.forEach((sec, i) => {
      lines.push('');
      lines.push(`### ${num(i)} — ${sec.title.toUpperCase()}`);
      sec.fields.forEach((f) => {
        if (f.type === 'tabs') {
          TABS.forEach((t) => { const v = val(`${f.id}_${t.toLowerCase()}`); if (v) lines.push(`• Exemples ${t} :\n${v}`); });
        } else if (f.type === 'file') {
          if (answers[f.id]) lines.push(`• ${f.label} : ${answers[f.id]}`);
        } else if (f.type === 'files') {
          const arr = answers[f.id] || [];
          if (arr.length) lines.push(`• ${f.label} (${arr.length}) :\n${arr.join('\n')}`);
        } else {
          const v = val(f.id); if (v) lines.push(`• ${f.label} : ${v}`);
        }
      });
    });
    lines.push('');
    lines.push(sep);
    lines.push('Fin du récapitulatif.');
    return lines.join('\n');
  };

  /* ---------- ENVOI ---------- */
  const resetTurnstile = () => {
    setTsToken('');
    try { if (window.turnstile && tsWidget.current != null) window.turnstile.reset(tsWidget.current); } catch (e) { /* noop */ }
  };

  const submit = async () => {
    const email = senderEmail.trim();
    if (!email) { setEmailErr(true); return; }
    if (!tsToken) { toast.error('Confirme que tu n\'es pas un robot.'); return; }
    setSending(true);
    const recap = buildRecap();
    const marque = val('marque') || 'Sans nom';
    try {
      await onboardingService.submitAudit({ marque, email, answers: { ...answers, email }, recap, _hp: hpRef.current, cf_turnstile_token: tsToken });
      setModal({ type: 'success' });
    } catch (e) {
      // 403 = anti-bot refusé : le token est à usage unique, on réarme le widget.
      resetTurnstile();
      if (e?.response?.status === 403) { toast.error('Vérification anti-bot échouée. Recommence.'); }
      else { setModal({ type: 'fallback', recap }); }
    }
    setSending(false);
  };

  const copyRecap = () => {
    const recap = modal?.recap || buildRecap();
    navigator.clipboard.writeText(recap).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };
  const downloadRecap = () => {
    const recap = modal?.recap || buildRecap();
    const m = (val('marque') || 'marque').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const blob = new Blob([recap], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit_marque_${m}.txt`;
    a.click();
  };

  /* ---------- RENDU D'UN CHAMP ----------
     Fonction (pas un composant) : renvoie des éléments réconciliés en place,
     sinon les <input> seraient remontés à chaque frappe et perdraient le focus. */
  const renderField = (f) => {
    const req = f.req ? <span className="req">*</span> : null;
    return (
      <div className="field" key={f.id}>
        <label>{f.label}{req}</label>
        {f.help && <p className="help">{f.help}</p>}

        {f.type === 'text' && (
          <input type="text" value={answers[f.id] || ''} placeholder={f.ph || ''} onChange={(e) => set(f.id, e.target.value)} />
        )}

        {f.type === 'textarea' && (
          <textarea value={answers[f.id] || ''} placeholder={f.ph || ''} onChange={(e) => set(f.id, e.target.value)} />
        )}

        {f.type === 'radio' && (
          <div className="pills">
            {f.options.map((o) => (
              <label key={o}>
                <input type="radio" name={f.id} value={o} checked={answers[f.id] === o} onChange={() => set(f.id, o)} />
                <span className="pill">{o}</span>
              </label>
            ))}
          </div>
        )}

        {f.type === 'color' && (
          <div className="color-row">
            <input type="color" value={answers[f.id] || f.default} onChange={(e) => set(f.id, e.target.value.toUpperCase())} />
            <input type="text" value={answers[f.id] || ''} placeholder="#000000" onChange={(e) => set(f.id, e.target.value)} />
          </div>
        )}

        {f.type === 'tabs' && (() => {
          const cur = tabIdx[f.id] || 0;
          const t = TABS[cur];
          return (
            <>
              <div className="tabs">
                {TABS.map((tb, k) => (
                  <button type="button" key={tb} className={k === cur ? 'on' : ''} onClick={() => setTabIdx((s) => ({ ...s, [f.id]: k }))}>{tb}</button>
                ))}
              </div>
              <div className="tabpane on">
                <textarea
                  value={answers[`${f.id}_${t.toLowerCase()}`] || ''}
                  placeholder={`Colle ici 1 à 3 de tes meilleurs posts ${t}. Sépare-les par une ligne ---`}
                  onChange={(e) => set(`${f.id}_${t.toLowerCase()}`, e.target.value)}
                />
              </div>
            </>
          );
        })()}

        {f.type === 'file' && (
          <div className="upload">
            {answers[f.id] && (
              <div className="thumbs">
                <div className="thumb">
                  <img src={answers[f.id]} alt="" />
                  <button type="button" aria-label="Retirer" onClick={() => removeUpload(f, answers[f.id])}>×</button>
                </div>
              </div>
            )}
            <label className={'uploadbtn' + (uploading[f.id] ? ' busy' : '')}>
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { doUpload(f, e.target.files); e.target.value = ''; }} />
              {uploading[f.id] ? 'Envoi…' : (answers[f.id] ? 'Remplacer le logo' : 'Importer le logo')}
            </label>
          </div>
        )}

        {f.type === 'files' && (() => {
          const arr = answers[f.id] || [];
          const full = arr.length >= MAX_IMAGES;
          return (
            <div className="upload">
              {arr.length > 0 && (
                <div className="thumbs">
                  {arr.map((url) => (
                    <div className="thumb" key={url}>
                      <img src={url} alt="" />
                      <button type="button" aria-label="Retirer" onClick={() => removeUpload(f, url)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className={'uploadbtn' + (uploading[f.id] ? ' busy' : '') + (full ? ' disabled' : '')}>
                <input type="file" accept="image/*" multiple disabled={full || uploading[f.id]} style={{ display: 'none' }}
                  onChange={(e) => { doUpload(f, e.target.files); e.target.value = ''; }} />
                {uploading[f.id] ? 'Envoi…' : full ? `Maximum atteint (${MAX_IMAGES})` : 'Ajouter des images'}
              </label>
              <span className="cap">{arr.length}/{MAX_IMAGES}</span>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="posab">
      <style>{CSS}</style>

      {/* Header / nav du site */}
      <nav className="topnav"><div className="wrap">
        <a href="/" className="tn-brand"><img src="/logo.png" alt="Presence OS" /><span>Presence&nbsp;OS</span></a>
        <div className="tn-links">
          <a href="/fonctionnalites">Fonctionnalités</a>
          <a href="/comment-ca-marche">Comment ça marche</a>
          <a href="/tarifs">Tarifs</a>
          <a href="/faq">FAQ</a>
        </div>
        <div className="tn-cta">
          <a href="/login" className="tn-login">Se connecter</a>
          <a href="/register" className="tn-start">Commencer</a>
        </div>
      </div></nav>

      {/* honeypot anti-bot (invisible) */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        onChange={(e) => { hpRef.current = e.target.value; }} />

      {/* HEADER */}
      <header className="top">
        <div className="wrap">
          <div className="brandrow">
            <img src="/logo.png" alt="Presence OS" className="glyph" />
            <div><b>Presence&nbsp;OS</b><br /><span>Onboarding</span></div>
          </div>
          <h1>Audit de marque.<br />Pour que l'IA parle <em>exactement</em> comme toi.</h1>
          <p className="lead">Ce questionnaire est l'étape de configuration de ton compte. Plus tes réponses sont <b>précises et détaillées</b>, plus les contenus générés sonnent justes — ton ton, ta cible, tes mots. Compte 20 à 30 minutes. Réponds avec tes mots, pas besoin de soigner la forme.</p>
          <div className="note">
            <div className="dot" />
            <div><span>Prends le temps de tout remplir, <b>le plus précisément possible</b>. C'est la matière qui nous sert à réaliser un vrai audit complet de ta marque et à paramétrer ton compte finement — pas un réglage générique. Plus tes réponses sont détaillées, plus l'IA sonnera comme toi.</span></div>
          </div>
        </div>
      </header>

      {/* PROGRESS */}
      <div className="progress-shell">
        <div className="wrap">
          <div className="pbar"><div className="pfill" style={{ width: pct + '%' }} /></div>
          <div className="pct">{pct}%</div>
        </div>
      </div>

      <div className="wrap">
        <div className="grid">
          {/* SIDEBAR */}
          <nav className="side">
            {FORM.map((sec, i) => (
              <a key={sec.id} href={'#' + sec.id}
                className={[active === sec.id ? 'active' : '', sectionFilled(sec) ? 'done' : ''].join(' ').trim()}>
                <span className="n">{num(i)}</span><span>{sec.title}</span><span className="tick" />
              </a>
            ))}
          </nav>

          {/* FORM */}
          <main>
            {FORM.map((sec, i) => (
              <section className="block" id={sec.id} key={sec.id}>
                <div className="eyebrow">{num(i)} — Étape</div>
                <h2>{sec.title}</h2>
                <p className="sub">{sec.sub}</p>
                {sec.fields.map((f) => renderField(f))}
              </section>
            ))}

            {/* BLOC FINAL */}
            <section className="block finish">
              <div className="eyebrow">C'est fini</div>
              <h2>Envoie tes réponses</h2>
              <p className="sub" style={{ marginBottom: 22 }}>On reçoit tout, on configure ton compte, et on revient vers toi.</p>
              <div style={{ maxWidth: 380, margin: '0 auto 22px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Ton email <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input type="text" value={senderEmail} placeholder="pour qu'on puisse te répondre"
                  onChange={(e) => { setSenderEmail(e.target.value); setEmailErr(false); }}
                  style={{ width: '100%', background: 'var(--input)', border: `1px solid ${emailErr ? 'var(--warn)' : 'var(--border)'}`, borderRadius: 11, color: 'var(--text)', font: 'inherit', fontSize: 14.5, padding: '12px 14px' }} />
              </div>
              <div ref={tsRef} className="ts" />
              <button className="btn primary" disabled={sending} onClick={submit} style={sending ? { opacity: 0.7 } : undefined}>
                {sending ? 'Envoi…' : 'Envoyer les informations'}
              </button>
            </section>
          </main>
        </div>
      </div>

      <footer className="wrap">
        <div>Presence OS · Questionnaire d'onboarding confidentiel</div>
        <div className="credit">Propulsé par GT BNB · Produit par Blackcore AI · Kraemer V · 78 bld Vitosha, Sofia</div>
      </footer>

      {/* MODALES */}
      {modal && (
        <div className="ov on" onClick={(e) => { if (e.currentTarget === e.target) setModal(null); }}>
          <div className="modal">
            {modal.type === 'success' ? (
              <>
                <div className="mh"><h3>C'est envoyé</h3><button className="x" onClick={() => setModal(null)}>×</button></div>
                <div className="mb"><p className="hint">Merci ! Tes réponses ont bien été transmises. <b>On revient vers toi</b> pour la configuration de ton compte.</p></div>
                <div className="mf"><button className="btn primary" onClick={() => setModal(null)}>Fermer</button></div>
              </>
            ) : (
              <>
                <div className="mh"><h3>Dernière étape</h3><button className="x" onClick={() => setModal(null)}>×</button></div>
                <div className="mb">
                  <p className="hint">L'envoi automatique n'est pas disponible. Pas de souci : <b>télécharge</b> ou <b>copie</b> ce document et renvoie-le nous.</p>
                  <textarea readOnly value={modal.recap} />
                </div>
                <div className="mf">
                  <button className="btn ghost" onClick={downloadRecap}>Télécharger (.txt)</button>
                  <button className="btn primary" onClick={copyRecap}>{copied ? 'Copié ✓' : 'Copier le texte'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- CSS SCOPÉ SOUS .posab ---------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
.posab{
  --bg:#020617; --bg2:#0B1120; --panel:#0F172A; --input:#0C111F;
  --border:#1E293B; --border2:#2C3A5A;
  --text:#EAF0FB; --muted:#8593AE; --faint:#5A6680;
  --blue:#5B6CFF; --blue-deep:#8A6CFF; --green:#3AFFA3; --warn:#F5A623;
  min-height:100vh; scroll-behavior:smooth;
  background:
    radial-gradient(900px 500px at 80% -10%, rgba(91,108,255,.14), transparent 60%),
    radial-gradient(700px 600px at -10% 20%, rgba(58,255,163,.06), transparent 55%),
    var(--bg);
  color:var(--text); font-family:'Inter',system-ui,-apple-system,sans-serif;
  line-height:1.55; -webkit-font-smoothing:antialiased;
}
.posab *{box-sizing:border-box}
.posab .wrap{max-width:1180px; margin:0 auto; padding:0 22px}
.posab .topnav{border-bottom:1px solid var(--border);background:rgba(2,6,23,.55);backdrop-filter:blur(8px)}
.posab .topnav .wrap{display:flex;align-items:center;gap:20px;padding-top:14px;padding-bottom:14px}
.posab .tn-brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--text)}
.posab .tn-brand img{width:30px;height:30px;object-fit:contain;border-radius:8px}
.posab .tn-brand span{font-family:'Space Grotesk';font-weight:600;letter-spacing:.12em;font-size:13px;text-transform:uppercase}
.posab .tn-links{display:flex;gap:22px;margin-left:10px}
.posab .tn-links a{color:var(--muted);text-decoration:none;font-size:14px;transition:.15s}
.posab .tn-links a:hover{color:var(--text)}
.posab .tn-cta{margin-left:auto;display:flex;align-items:center;gap:16px}
.posab .tn-login{color:var(--text);text-decoration:none;font-size:14px;font-weight:500;white-space:nowrap}
.posab .tn-login:hover{color:var(--blue)}
.posab .tn-start{font-family:'Space Grotesk';font-weight:600;font-size:14px;text-decoration:none;white-space:nowrap;padding:9px 18px;border-radius:10px;background:linear-gradient(135deg,var(--blue),var(--blue-deep));color:#fff;box-shadow:0 8px 24px rgba(91,108,255,.35);transition:.18s}
.posab .tn-start:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(91,108,255,.45)}
@media(max-width:760px){.posab .tn-links{display:none}}
.posab header.top{padding:46px 0 30px; border-bottom:1px solid var(--border)}
.posab .brandrow{display:flex; align-items:center; gap:14px; margin-bottom:26px}
.posab .glyph{width:44px;height:44px;border-radius:10px;object-fit:contain;display:block}
.posab .brandrow b{font-family:'Space Grotesk';font-weight:600;letter-spacing:.14em;font-size:14px;text-transform:uppercase}
.posab .brandrow span{color:var(--muted);font-size:13px}
.posab h1{font-family:'Space Grotesk';font-weight:700;font-size:clamp(28px,4.6vw,46px);line-height:1.08;margin:0 0 16px;letter-spacing:-.02em}
.posab h1 em{font-style:normal;color:var(--blue)}
.posab .lead{color:var(--muted);max-width:680px;font-size:16px;margin:0}
.posab .lead b{color:var(--text);font-weight:600}
.posab .note{margin-top:22px;display:flex;gap:12px;align-items:flex-start;background:rgba(91,108,255,.08);border:1px solid rgba(91,108,255,.25);border-radius:12px;padding:14px 16px;max-width:760px;font-size:14px}
.posab .note .dot{width:8px;height:8px;border-radius:50%;background:var(--green);margin-top:7px;flex:none;box-shadow:0 0 12px var(--green)}
.posab .note span{color:var(--muted)} .posab .note b{color:var(--text)}
.posab .progress-shell{position:sticky;top:0;z-index:40;background:rgba(2,6,23,.86);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
.posab .progress-shell .wrap{display:flex;align-items:center;gap:16px;padding-top:12px;padding-bottom:12px}
.posab .pbar{flex:1;height:6px;background:var(--border);border-radius:99px;overflow:hidden}
.posab .pfill{height:100%;width:0;background:linear-gradient(90deg,var(--green),var(--blue));border-radius:99px;transition:width .35s ease}
.posab .pct{font-family:'Space Grotesk';font-weight:600;font-size:13px;color:var(--muted);min-width:42px;text-align:right}
.posab .grid{display:grid;grid-template-columns:230px 1fr;gap:40px;padding:38px 0 80px}
.posab nav.side{position:sticky;top:78px;align-self:start;max-height:calc(100vh - 100px);overflow:auto}
.posab nav.side a{display:flex;gap:11px;align-items:center;padding:8px 10px;border-radius:9px;color:var(--muted);text-decoration:none;font-size:13.5px;transition:.15s}
.posab nav.side a:hover{color:var(--text);background:var(--bg2)}
.posab nav.side a.active{color:var(--text);background:var(--bg2)}
.posab nav.side a .n{font-family:'Space Grotesk';font-size:11px;color:var(--faint);min-width:18px}
.posab nav.side a.active .n{color:var(--blue)}
.posab nav.side a .tick{width:7px;height:7px;border-radius:50%;border:1.5px solid var(--border2);margin-left:auto;flex:none}
.posab nav.side a.done .tick{background:var(--green);border-color:var(--green);box-shadow:0 0 8px var(--green)}
.posab main{min-width:0}
.posab section.block{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:30px;margin-bottom:22px;scroll-margin-top:90px}
.posab .eyebrow{font-family:'Space Grotesk';font-weight:600;letter-spacing:.16em;font-size:12px;color:var(--blue);text-transform:uppercase}
.posab section.block h2{font-family:'Space Grotesk';font-weight:600;font-size:22px;margin:8px 0 4px;letter-spacing:-.01em}
.posab section.block .sub{color:var(--muted);font-size:14px;margin:0 0 24px}
.posab .field{margin-bottom:22px}
.posab .field:last-child{margin-bottom:0}
.posab .field label{display:block;font-weight:600;font-size:14.5px;margin-bottom:5px}
.posab .field label .req{color:var(--blue);margin-left:4px}
.posab .field .help{color:var(--muted);font-size:13px;margin:0 0 9px}
.posab .field input[type=text], .posab .field textarea, .posab .field select{width:100%;background:var(--input);border:1px solid var(--border);border-radius:11px;color:var(--text);font:inherit;font-size:14.5px;padding:12px 14px;transition:.15s;resize:vertical}
.posab .field textarea{min-height:96px;line-height:1.5}
.posab .field input::placeholder,.posab .field textarea::placeholder{color:#4D5A75}
.posab .field input:focus,.posab .field textarea:focus,.posab .field select:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(91,108,255,.18);background:#0A1020}
.posab .pills{display:flex;flex-wrap:wrap;gap:8px}
.posab .pills label{cursor:pointer;margin:0}
.posab .pills input{position:absolute;opacity:0;width:0;height:0}
.posab .pills .pill{display:inline-block;padding:9px 15px;border:1px solid var(--border);border-radius:99px;font-size:13.5px;color:var(--muted);background:var(--input);transition:.15s;user-select:none}
.posab .pills input:checked + .pill{border-color:var(--blue);color:#fff;background:rgba(91,108,255,.16);box-shadow:inset 0 0 0 1px var(--blue)}
.posab .pills label:hover .pill{color:var(--text)}
.posab .color-row{display:flex;align-items:center;gap:12px}
.posab .color-row input[type=color]{width:48px;height:46px;padding:0;border:1px solid var(--border);border-radius:11px;background:var(--input);cursor:pointer}
.posab .color-row input[type=text]{flex:1}
.posab .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.posab .tabs button{font:inherit;font-size:13px;font-weight:500;padding:7px 14px;border-radius:9px;border:1px solid var(--border);background:var(--input);color:var(--muted);cursor:pointer;transition:.15s}
.posab .tabs button.on{background:rgba(91,108,255,.16);border-color:var(--blue);color:#fff}
.posab .upload{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
.posab .upload .thumbs{display:flex;flex-wrap:wrap;gap:10px}
.posab .upload .thumb{position:relative;width:72px;height:72px;border-radius:11px;overflow:hidden;border:1px solid var(--border);background:var(--input)}
.posab .upload .thumb img{width:100%;height:100%;object-fit:cover;display:block}
.posab .upload .thumb button{position:absolute;top:3px;right:3px;width:20px;height:20px;border:none;border-radius:50%;background:rgba(4,6,12,.75);color:#fff;font-size:14px;line-height:1;cursor:pointer;display:grid;place-items:center}
.posab .upload .thumb button:hover{background:#e5484d}
.posab .uploadbtn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border:1px dashed var(--border2);border-radius:11px;color:var(--text);background:var(--input);font-size:13.5px;cursor:pointer;transition:.15s;user-select:none}
.posab .uploadbtn:hover{border-color:var(--blue);color:#fff}
.posab .uploadbtn.busy{opacity:.6;cursor:progress}
.posab .uploadbtn.disabled{opacity:.5;cursor:not-allowed;border-style:solid}
.posab .upload .cap{font-size:12px;color:var(--faint);font-family:'Space Grotesk'}
.posab .ts{display:flex;justify-content:center;margin:0 auto 18px;min-height:66px}
.posab .finish{background:linear-gradient(135deg,rgba(91,108,255,.12),rgba(58,255,163,.05));border:1px solid var(--border2);text-align:center}
.posab .finish h2{font-size:24px}
.posab .btn{font-family:'Space Grotesk';font-weight:600;font-size:15px;border:none;cursor:pointer;border-radius:12px;padding:15px 30px;transition:.18s;display:inline-flex;gap:10px;align-items:center}
.posab .btn.primary{background:linear-gradient(135deg,var(--blue),var(--blue-deep));color:#fff;box-shadow:0 10px 30px rgba(91,108,255,.4)}
.posab .btn.primary:hover{transform:translateY(-2px);box-shadow:0 14px 38px rgba(91,108,255,.5)}
.posab .btn.ghost{background:var(--input);color:var(--text);border:1px solid var(--border2)}
.posab .btn.ghost:hover{border-color:var(--blue)}
.posab .ov{position:fixed;inset:0;background:rgba(4,6,12,.78);backdrop-filter:blur(6px);z-index:90;display:none;align-items:center;justify-content:center;padding:24px}
.posab .ov.on{display:flex}
.posab .modal{background:var(--bg2);border:1px solid var(--border2);border-radius:18px;max-width:760px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.posab .modal .mh{padding:22px 26px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
.posab .modal .mh h3{font-family:'Space Grotesk';font-weight:600;font-size:18px;margin:0}
.posab .modal .mh .x{background:none;border:none;color:var(--muted);font-size:24px;cursor:pointer;line-height:1}
.posab .modal .mb{padding:22px 26px;overflow:auto}
.posab .modal textarea{width:100%;min-height:300px;background:var(--input);border:1px solid var(--border);border-radius:11px;color:var(--text);font-family:ui-monospace,monospace;font-size:12.5px;line-height:1.6;padding:16px;resize:vertical}
.posab .modal .mf{padding:18px 26px;border-top:1px solid var(--border);display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap}
.posab .modal .hint{color:var(--muted);font-size:13px;margin:0 0 14px}
.posab .modal .hint b{color:var(--green)}
.posab footer{text-align:center;color:var(--faint);font-size:12.5px;padding:30px 0 50px;border-top:1px solid var(--border)}
.posab footer .credit{margin-top:7px;font-size:11.5px;letter-spacing:.04em;color:#46506B}
@media(max-width:860px){
  .posab .grid{grid-template-columns:1fr;gap:0;padding-top:24px}
  .posab nav.side{display:none}
  .posab section.block{padding:22px}
}
@media(prefers-reduced-motion:reduce){.posab *{transition:none!important;scroll-behavior:auto!important}}
`;
