// Données + icônes + styles partagés par les pages marketing (landing multi-pages).

export const NET = {
  linkedin: { bg: '#0a66c2', d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
  instagram: { bg: 'linear-gradient(135deg,#feda75,#d62976,#962fbf)', d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
  facebook: { bg: '#1877f2', d: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
  tiktok: { bg: '#111', border: '1px solid #2b2b2b', d: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  youtube: { bg: '#ff0000', d: 'M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' },
};
export const NetIcon = ({ id, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff"><path d={NET[id].d} /></svg>
);
export const Check = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3AFFA3" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>;

export const FEATURES = [
  ['Génération IA', 'Des posts calibrés sur ta voix de marque, ton secteur et tes piliers — en quelques secondes.'],
  ['Multi-réseaux', 'LinkedIn, Instagram, Facebook, TikTok, YouTube — publie partout depuis un seul endroit.'],
  ['Planification', 'Calendrier éditorial, créneaux automatiques, publication à la bonne heure dans ton fuseau.'],
  ['Commentaires & inbox', 'Réponds, aime, masque tes commentaires depuis un seul endroit — avec notification dès qu’un nouveau arrive.'],
  ['Analyse des performances', 'Impressions, j’aime, partages et engagement par post, synchronisés automatiquement chaque heure.'],
  ['Carrousels brandés', 'Des carrousels aux couleurs de ta marque, générés et prêts à poster (PDF LinkedIn inclus).'],
  ['Notifications push', 'Sois prévenu quand un post est programmé, publié ou échoue — même app fermée.'],
  ['Avatar vidéo IA', 'Transforme tes scripts en vidéos avec ton avatar digital. Du texte à la vidéo, sans tournage.'],
];
export const STEPS = [
  ['Définis ta marque', 'Renseigne ta voix, ton secteur, tes piliers. L’IA apprend qui tu es.'],
  ['L’IA génère', 'Sujets, posts, carrousels, scripts vidéo — adaptés à chaque réseau.'],
  ['Valide & programme', 'Tu relis, tu ajustes, tu programmes. La publication part toute seule.'],
];
export const PLANS = [
  { name: 'Gratuit', price: '0€', credits: 100, feats: ['1 réseau connecté', 'Génération de posts', 'Support communauté'], cta: 'Commencer', to: '/register' },
  { name: 'Pro', price: '19€', credits: 1000, popular: true, feats: ['Les 5 réseaux', 'Carrousels + planification', 'Notifications push'], cta: 'Choisir Pro', to: '/register' },
  { name: 'Business', price: '49€', credits: 3000, feats: ['Avatar vidéo IA', 'Multi-profils', 'Support prioritaire'], cta: 'Choisir Business', to: '/register' },
];
export const FAQ = [
  ['C’est vraiment gratuit pour démarrer ?', 'Oui — l’offre Gratuite te laisse tester sans carte bancaire. Tu passes à une offre payante seulement si tu as besoin de plus de crédits ou de fonctionnalités.'],
  ['Sur quels réseaux puis-je publier ?', 'LinkedIn, Instagram, Facebook, TikTok et YouTube — tu connectes tes comptes en quelques clics.'],
  ['Comment fonctionnent les crédits ?', 'Chaque génération (post, carrousel, image, script vidéo) consomme des crédits selon la qualité choisie. Tu vois ton solde en temps réel.'],
  ['Mes données sont-elles en sécurité ?', 'Tes comptes sociaux sont connectés via OAuth officiel : on ne stocke jamais tes mots de passe, et tu peux déconnecter un réseau à tout moment.'],
];

// Coordonnées de l'éditeur (à compléter par Martin)
export const LEGAL = {
  societe: '[RAISON SOCIALE]',
  statut: '[FORME JURIDIQUE – ex. SAS / auto-entrepreneur]',
  siret: '[SIRET]',
  adresse: '[ADRESSE POSTALE]',
  email: 'martindumoulin88@gmail.com',
  directeur: '[DIRECTEUR DE LA PUBLICATION]',
  hebergeur: 'Railway (Railway Corp., 548 Market St, San Francisco, CA, USA) — frontend/back-end ; Supabase (bases de données)',
  maj: '24 juin 2026',
};

// Bandeau pour valeur à compléter
export const Ph = ({ children }) => <span className="ph">{children}</span>;

// Wrapper de page légale (titre + prose)
export const LegalPage = ({ title, children }) => (
  <section><div className="wrap"><div className="legal">
    <div className="h2">{title}</div>
    <p className="updated">Dernière mise à jour : {LEGAL.maj}</p>
    {children}
  </div></div></section>
);

// Titre de section réutilisable
export const SectionHead = ({ eyebrow, title, lead }) => (
  <>
    <div className="eyebrow">{eyebrow}</div>
    <div className="h2">{title}</div>
    {lead && <p className="lead">{lead}</p>}
  </>
);

export const CSS = `
.lp{--bg:#020617;--card:#0f172a;--panel:#0b1322;--line:rgba(255,255,255,.06);--line2:rgba(255,255,255,.12);--ink:#e8edf6;--muted:#93a1b8;--dim:#5b6a82;--grad:linear-gradient(135deg,#5B6CFF,#8A6CFF);--accent:#3AFFA3;background:var(--bg);color:var(--ink);font-family:Inter,sans-serif;min-height:100vh;overflow-x:hidden;display:flex;flex-direction:column}
.lp *{box-sizing:border-box}
.lp a{text-decoration:none;color:inherit}
.lp .wrap{max-width:1140px;margin:0 auto;padding:0 24px;width:100%}
.lp .pagebody{flex:1}
.lp .btn{display:inline-flex;align-items:center;gap:9px;font:600 15px Inter;padding:14px 26px;border-radius:12px;cursor:pointer;transition:.15s;border:none}
.lp .btn.sm{padding:9px 18px;font-size:14px}
.lp .btn-grad{background:var(--grad);color:#fff;box-shadow:0 10px 30px rgba(91,108,255,.35)}
.lp .btn-grad:hover{filter:brightness(1.08)}
.lp .btn-ghost{background:rgba(58,255,163,.08);color:var(--accent);border:1px solid rgba(58,255,163,.3)}
.lp .btn-ghost:hover{background:rgba(58,255,163,.16)}
.lp .btn-soft{background:rgba(255,255,255,.05);color:var(--ink);border:1px solid var(--line2)}
.lp nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(14px);background:rgba(2,6,23,.7);border-bottom:1px solid var(--line)}
.lp nav .wrap{display:flex;align-items:center;justify-content:space-between;height:68px}
.lp .brand{display:flex;align-items:center;gap:11px}
.lp .brand img{width:38px;height:38px;object-fit:contain}
.lp .brand b{font-family:Sora;font-weight:800;font-size:18px;display:block}
.lp .brand small{display:block;font-size:11px;color:var(--dim);margin-top:-2px}
.lp .navlinks{display:flex;align-items:center;gap:30px;font-size:14.5px;color:var(--muted)}
.lp .navlinks a:hover{color:#fff}
.lp .navlinks a.active{color:#fff}
.lp .nav-cta{display:flex;gap:12px;align-items:center}
.lp .nav-cta .login{font-size:14.5px;color:var(--muted)}
.lp .nav-cta .login:hover{color:#fff}
.lp .hero{position:relative;padding:90px 0 70px;text-align:center;overflow:hidden}
.lp .hero::before{content:"";position:absolute;top:-120px;left:50%;transform:translateX(-50%);width:760px;height:520px;background:radial-gradient(circle,rgba(91,108,255,.22),transparent 65%);pointer-events:none}
.lp .hero>*{position:relative;z-index:1}
.lp .pill{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--accent);background:rgba(58,255,163,.08);border:1px solid rgba(58,255,163,.22);padding:7px 14px;border-radius:999px;margin-bottom:26px}
.lp .pill .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.lp h1{font-family:Sora;font-weight:800;font-size:58px;line-height:1.04;letter-spacing:-.025em;max-width:880px;margin:0 auto}
.lp h1 .g{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.lp .sub{font-size:19px;color:var(--muted);max-width:620px;margin:24px auto 0;line-height:1.6}
.lp .cta-row{display:flex;gap:14px;justify-content:center;margin-top:38px;flex-wrap:wrap}
.lp .cta-row.center{justify-content:center}
.lp .note{margin-top:16px;font-size:13px;color:var(--dim)}
.lp .preview{margin:58px auto 0;max-width:980px;border-radius:20px;border:1px solid var(--line2);background:linear-gradient(180deg,#0f172a,#0b1322);padding:14px;box-shadow:0 40px 120px -30px rgba(91,108,255,.4)}
.lp .pbar{display:flex;gap:7px;padding:6px 8px 12px}
.lp .pbar i{width:11px;height:11px;border-radius:50%;background:#2a3550}
.lp .shot{border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--bg);height:430px;display:grid;grid-template-columns:210px 1fr;text-align:left}
.lp .shot .sb{background:#080c17;border-right:1px solid var(--line);padding:18px 14px}
.lp .shot .sb .lg{display:flex;align-items:center;gap:8px;margin-bottom:22px}
.lp .shot .sb .lg img{width:26px;height:26px}
.lp .shot .sb .lg b{font-family:Sora;font-weight:800;font-size:13px}
.lp .shot .sb .it{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;font-size:12.5px;color:var(--muted);margin-bottom:3px}
.lp .shot .sb .it.on{background:rgba(255,255,255,.06);color:#fff}
.lp .shot .sb .it .ic{width:15px;height:15px;border-radius:4px;background:#2a3550}
.lp .shot .sb .it.on .ic{background:var(--grad)}
.lp .shot .main{padding:22px}
.lp .shot .main .t{font-family:Sora;font-weight:700;font-size:17px;margin-bottom:3px}
.lp .shot .main .d{font-size:12px;color:var(--dim);margin-bottom:18px}
.lp .shot .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.lp .ccard{background:var(--card);border:1px solid var(--line);border-radius:12px;height:150px;padding:12px;display:flex;flex-direction:column}
.lp .ccard .cnet{width:24px;height:24px;border-radius:7px;display:grid;place-items:center}
.lp .ccard .ph{flex:1;margin:10px 0;border-radius:8px;background:repeating-linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.04) 8px,transparent 8px,transparent 16px)}
.lp .ccard .tag{align-self:flex-start;font-size:9px;font-weight:600;padding:3px 8px;border-radius:6px;background:rgba(58,255,163,.14);color:var(--accent)}
.lp .ccard .tag.pub{background:rgba(96,165,250,.15);color:#93c5fd}
.lp .ccard .tag.warn{background:rgba(251,191,36,.14);color:#fcd770}
/* ---- Aperçu animé multi-écrans ---- */
.lp .shot .main{position:relative;overflow:hidden}
.lp .hp-scene{display:flex;flex-direction:column;height:100%}
@keyframes hpUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes hpScene{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}
.lp .hp-scene{animation:hpScene .4s ease both}
.lp .hp-anim{animation:hpUp .45s ease both}
.lp .hp-list{display:flex;flex-direction:column;gap:9px;margin-top:6px}
.lp .hp-item{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:11px;padding:11px 13px}
.lp .hp-item .hp-spark{width:26px;height:26px;border-radius:7px;flex-shrink:0;display:grid;place-items:center;background:rgba(138,108,255,.14);border:1px solid rgba(138,108,255,.28)}
.lp .hp-item .hp-itext{flex:1;font-size:12.5px;color:var(--ink);line-height:1.3}
.lp .hp-item .hp-add{font-size:10.5px;font-weight:700;color:var(--accent);background:rgba(58,255,163,.12);padding:4px 9px;border-radius:7px;white-space:nowrap}
.lp .hp-chips{display:flex;gap:8px;margin:4px 0 12px}
.lp .hp-chip{font-size:11px;font-weight:600;color:var(--muted);background:rgba(255,255,255,.05);border:1px solid var(--line);padding:5px 11px;border-radius:999px}
.lp .hp-chip.on{color:var(--accent);background:rgba(58,255,163,.12);border-color:rgba(58,255,163,.25)}
.lp .hp-cmts{display:flex;flex-direction:column;gap:10px}
.lp .hp-cmt{display:flex;gap:11px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}
.lp .hp-cmt .hp-av{width:32px;height:32px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px}
.lp .hp-cmt .hp-cname{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--ink)}
.lp .hp-cmt .hp-cnet{width:14px;height:14px;border-radius:4px;display:grid;place-items:center}
.lp .hp-cmt .hp-ctext{font-size:12px;color:var(--muted);margin:3px 0 7px;line-height:1.4}
.lp .hp-cmt .hp-cact{display:flex;gap:14px;font-size:11px;font-weight:600;color:var(--dim)}
.lp .hp-cmt .hp-cact .r{color:#8aa0ff}
.lp .hp-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:8px}
.lp .hp-cell{aspect-ratio:1;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:5px;display:flex;flex-direction:column;justify-content:space-between}
.lp .hp-cell .num{font-size:9px;color:var(--dim)}
.lp .hp-cell .dots{display:flex;gap:3px;flex-wrap:wrap}
.lp .hp-cell .dot{width:7px;height:7px;border-radius:50%}
.lp .hp-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:6px}
.lp .hp-kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 13px}
.lp .hp-kpi .kl{font-size:11px;color:var(--muted)}
.lp .hp-kpi .kv{font-family:Sora;font-weight:800;font-size:21px;margin-top:3px}
.lp .hp-kpi .kd{font-size:10px;color:var(--accent);font-weight:700;margin-top:2px}
.lp .hp-dots{display:flex;justify-content:center;gap:7px;padding-top:14px;margin-top:auto}
.lp .hp-dots button{width:7px;height:7px;border-radius:999px;border:none;background:#2a3550;cursor:pointer;padding:0;transition:.2s}
.lp .hp-dots button.on{width:22px;background:var(--grad)}
.lp section{padding:84px 0}
.lp section.alt{background:var(--panel);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.lp .eyebrow{text-align:center;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:600}
.lp .h2{font-family:Sora;font-weight:800;font-size:38px;text-align:center;letter-spacing:-.02em;margin-top:12px}
.lp .lead{text-align:center;color:var(--muted);max-width:560px;margin:14px auto 0;font-size:16px;line-height:1.6}
.lp .features{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:52px}
.lp .fcard{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;transition:.2s}
.lp .fcard:hover{border-color:var(--line2);transform:translateY(-3px)}
.lp .fcard .fi{width:46px;height:46px;border-radius:12px;background:rgba(91,108,255,.12);border:1px solid rgba(91,108,255,.25);display:grid;place-items:center;margin-bottom:18px}
.lp .fcard h3{font-family:Sora;font-weight:700;font-size:17.5px;margin-bottom:8px}
.lp .fcard p{color:var(--muted);font-size:14px;line-height:1.6}
.lp .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:52px}
.lp .step{text-align:center}
.lp .step .n{width:54px;height:54px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;font-family:Sora;font-weight:800;font-size:20px;color:#fff;background:var(--grad);box-shadow:0 10px 30px rgba(91,108,255,.3)}
.lp .step h3{font-family:Sora;font-weight:700;font-size:17px;margin-bottom:8px}
.lp .step p{color:var(--muted);font-size:14px;line-height:1.6;max-width:300px;margin:0 auto}
.lp .nets{display:flex;justify-content:center;gap:30px;flex-wrap:wrap;margin-top:40px;align-items:center}
.lp .nets .nx{display:flex;align-items:center;gap:10px;color:var(--muted);font-weight:600;font-size:14.5px}
.lp .nets .nx .b{width:34px;height:34px;border-radius:9px;display:grid;place-items:center}
.lp .pricing{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:52px;align-items:stretch}
.lp .plan{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:30px;display:flex;flex-direction:column}
.lp .plan.pop{border-color:rgba(91,108,255,.5);background:linear-gradient(180deg,rgba(91,108,255,.10),var(--card));position:relative;box-shadow:0 30px 80px -34px rgba(91,108,255,.55)}
.lp .plan .pbadge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--grad);color:#fff;font-size:11px;font-weight:700;padding:5px 14px;border-radius:999px;white-space:nowrap}
.lp .plan .pname{font-family:Sora;font-weight:700;font-size:18px}
.lp .plan .price{font-family:Sora;font-weight:800;font-size:42px;margin:16px 0 2px}
.lp .plan .price small{font-size:15px;color:var(--muted);font-weight:600}
.lp .plan .pcred{color:var(--accent);font-size:13px;font-weight:600}
.lp .plan ul{list-style:none;margin:22px 0;padding:0;display:flex;flex-direction:column;gap:12px;flex:1}
.lp .plan li{display:flex;align-items:flex-start;gap:10px;font-size:14px;color:var(--muted)}
.lp .plan li svg{flex-shrink:0;margin-top:1px}
.lp .plan .pbtn{justify-content:center;width:100%}
.lp .faq{max-width:760px;margin:46px auto 0;display:flex;flex-direction:column;gap:12px}
.lp .qa{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px}
.lp .qa .q{font-family:Sora;font-weight:600;font-size:15.5px}
.lp .qa .a{color:var(--muted);font-size:14px;line-height:1.6;margin-top:9px}
.lp .ctaband{background:linear-gradient(135deg,rgba(91,108,255,.14),rgba(138,108,255,.10));border:1px solid var(--line2);border-radius:26px;padding:60px;text-align:center;position:relative;overflow:hidden}
.lp .ctaband h2{font-family:Sora;font-weight:800;font-size:34px;letter-spacing:-.02em}
.lp .ctaband p{color:var(--muted);margin:14px auto 30px;max-width:480px}
.lp footer{border-top:1px solid var(--line);padding:36px 0}
.lp footer .wrap{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.lp footer .flinks{display:flex;gap:24px;font-size:13.5px;color:var(--dim)}
.lp footer .flinks a:hover{color:#fff}
.lp .legal{max-width:820px;margin:0 auto;padding:60px 0 40px}
.lp .legal .h2{text-align:left;font-size:34px}
.lp .legal .updated{color:var(--dim);font-size:13px;margin-top:10px}
.lp .legal h3{font-family:Sora;font-weight:700;font-size:19px;margin:34px 0 10px;color:#fff}
.lp .legal p,.lp .legal li{color:var(--muted);font-size:15px;line-height:1.75}
.lp .legal ul{margin:10px 0;padding-left:22px;display:flex;flex-direction:column;gap:6px}
.lp .legal a{color:#8aa0ff}
.lp .legal a:hover{color:#fff}
.lp .legal .ph{color:#fcd770}
@media (max-width:760px){
  .lp .legal{padding:36px 0}
  .lp .legal .h2{font-size:25px}
  .lp .navlinks,.lp .nav-cta .login,.lp .brand small{display:none}
  .lp nav .wrap{height:60px}
  .lp .hero{padding:54px 0 46px}
  .lp h1{font-size:33px;line-height:1.08}
  .lp .sub{font-size:16px}
  .lp .cta-row{flex-direction:column;gap:11px}
  .lp .cta-row .btn{width:100%;justify-content:center}
  .lp .preview{margin-top:40px;padding:10px}
  .lp .shot{grid-template-columns:1fr;height:auto}
  .lp .shot .sb{display:none}
  .lp .shot .grid3{grid-template-columns:1fr 1fr;gap:10px}
  .lp .ccard{height:125px}
  .lp section{padding:54px 0}
  .lp .h2{font-size:27px}.lp .ctaband h2{font-size:25px}
  .lp .features,.lp .pricing{grid-template-columns:1fr;gap:14px;margin-top:32px}
  .lp .steps{grid-template-columns:1fr;gap:28px;margin-top:34px}
  .lp .ctaband{padding:36px 22px}
  .lp footer .wrap{flex-direction:column;align-items:flex-start;gap:16px}
}
`;
