import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { onboardingService } from '../services/onboardingService';
import LangSwitcher from '../components/LangSwitcher';

const MAX_FILE_MB = 5;
const MAX_IMAGES = 6;
const TURNSTILE_SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

/* ---------- SOURCE DE VÉRITÉ : structure du formulaire ----------
   Les textes vivent dans les locales sous audit.sec.<section> / audit.f.<champ>
   (label / help / ph / opt.<slug>). Les radios stockent le SLUG (stable
   quelle que soit la langue) ; le récap les retraduit en français. */
const FORM = [
  { id: 'identite', fields: [
    { id: 'marque', type: 'text', req: 1, ph: 1 },
    { id: 'dirigeant', type: 'text', req: 1, ph: 1 },
    { id: 'site', type: 'text', ph: 1 },
    { id: 'secteur', type: 'text', req: 1, help: 1, ph: 1 },
    { id: 'anciennete', type: 'text', ph: 1 },
    { id: 'zone', type: 'text', ph: 1 },
    { id: 'pitch', type: 'textarea', req: 1, help: 1, ph: 1 },
  ] },
  { id: 'offre', fields: [
    { id: 'produits', type: 'textarea', req: 1, ph: 1 },
    { id: 'valeur', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'diff', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'concurrents', type: 'text', help: 1, ph: 1 },
    { id: 'histoire', type: 'textarea', help: 1, ph: 1 },
    { id: 'position', type: 'radio', options: ['premium', 'milieu', 'accessible', 'surmesure'] },
  ] },
  { id: 'cible', fields: [
    { id: 'persona', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'douleurs', type: 'textarea', req: 1, ph: 1 },
    { id: 'desir', type: 'textarea', help: 1, ph: 1 },
    { id: 'objections', type: 'textarea', help: 1, ph: 1 },
    { id: 'vocabulaire', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'voix', fields: [
    { id: 'adresse', type: 'radio', req: 1, options: ['tutoiement', 'vouvoiement', 'depend'] },
    { id: 'adjectifs', type: 'text', req: 1, help: 1, ph: 1 },
    { id: 'langage', type: 'radio', options: ['familier', 'pro', 'expert', 'premium'] },
    { id: 'emojis', type: 'radio', options: ['beaucoup', 'parcimonie', 'jamais'] },
    { id: 'phrases', type: 'radio', options: ['courtes', 'developpees', 'mix'] },
    { id: 'personne', type: 'textarea', help: 1, ph: 1 },
    { id: 'inspirations_ton', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'piliers', fields: [
    { id: 'themes', type: 'textarea', req: 1, help: 1, ph: 1 },
    { id: 'reference', type: 'text', help: 1, ph: 1 },
    { id: 'message', type: 'textarea', help: 1, ph: 1 },
    { id: 'opinions', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'eviter', fields: [
    { id: 'mots_bannis', type: 'textarea', help: 1, ph: 1 },
    { id: 'tons_eviter', type: 'text', ph: 1 },
    { id: 'tabous', type: 'textarea', help: 1, ph: 1 },
    { id: 'promesses', type: 'textarea', help: 1, ph: 1 },
    { id: 'legal', type: 'textarea', help: 1, ph: 1 },
  ] },
  { id: 'hooks', fields: [
    { id: 'hooks_ok', type: 'textarea', help: 1, ph: 1 },
    { id: 'cta', type: 'textarea', help: 1, ph: 1 },
    { id: 'offres_push', type: 'textarea', ph: 1 },
  ] },
  { id: 'regles', fields: [
    { id: 'bible', type: 'textarea', help: 1, ph: 1 },
    { id: 'structure_post', type: 'textarea', help: 1, ph: 1 },
    { id: 'cta_nombre', type: 'radio', options: ['unseul', 'contexte', 'plusieurs'] },
    { id: 'hashtags', type: 'radio', options: ['beaucoup', 'cibles', 'aucun'] },
  ] },
  { id: 'exemples', fields: [
    { id: 'ex_linkedin', type: 'tabs' },
  ] },
  { id: 'reseaux', fields: [
    { id: 'plateformes', type: 'text', req: 1, ph: 1 },
    { id: 'profils', type: 'textarea', help: 1, ph: 1 },
    { id: 'frequence', type: 'radio', options: ['s12', 's34', 'j1', 'jplus'] },
    { id: 'creneaux', type: 'text', ph: 1 },
  ] },
  { id: 'visuel', fields: [
    { id: 'col1', type: 'color', default: '#2B7BFF' },
    { id: 'col2', type: 'color', default: '#0A4FCC' },
    { id: 'col3', type: 'color', default: '#3AFFA3' },
    { id: 'charte', type: 'file', help: 1 },
    { id: 'style_visuel', type: 'textarea', help: 1, ph: 1 },
    { id: 'polices', type: 'text', ph: 1 },
    { id: 'inspis_visuel', type: 'textarea', help: 1, ph: 1 },
    { id: 'visuels_upload', type: 'files', help: 1, helpVars: { max: MAX_IMAGES, mb: MAX_FILE_MB } },
  ] },
  { id: 'objectifs', fields: [
    { id: 'objectif', type: 'radio', req: 1, options: ['notoriete', 'leads', 'vendre', 'recruter', 'tout'] },
    { id: 'succes', type: 'text', ph: 1 },
    { id: 'libre', type: 'textarea', help: 1, ph: 1 },
  ] },
];

const TABS = ['LinkedIn', 'Instagram', 'Facebook', 'TikTok'];

const num = (i) => String(i + 1).padStart(2, '0');

export default function AuditMarque() {
  const { t, i18n } = useTranslation();
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
      if (room <= 0) { toast.error(t('audit.ui.maxImages', { n: MAX_IMAGES })); return; }
      if (files.length > room) { toast.error(t('audit.ui.maxImagesTronque', { n: MAX_IMAGES, room })); files = files.slice(0, room); }
    } else {
      files = files.slice(0, 1);
    }

    const valid = files.filter((file) => {
      if (!file.type.startsWith('image/')) { toast.error(t('audit.ui.pasImage', { name: file.name })); return false; }
      if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(t('audit.ui.tropGros', { name: file.name, mb: MAX_FILE_MB })); return false; }
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
      toast.error(e?.response?.status === 429 ? t('audit.ui.trop429') : t('audit.ui.uploadEchec'));
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

  /* ---------- RÉCAP ----------
     Toujours généré en FRANÇAIS (lecture interne par l'équipe), quelle que soit
     la langue d'affichage du visiteur. Les réponses libres restent telles quelles. */
  const buildRecap = () => {
    const tf = i18n.getFixedT('fr');
    const lines = [];
    const sep = '═══════════════════════════════════════════';
    lines.push(sep);
    lines.push('AUDIT DE MARQUE — ONBOARDING PRESENCE OS');
    lines.push('Marque : ' + (val('marque') || '—'));
    lines.push('Date : ' + new Date().toLocaleDateString('fr-FR'));
    lines.push(sep);
    FORM.forEach((sec, i) => {
      lines.push('');
      lines.push(`### ${num(i)} — ${tf(`audit.sec.${sec.id}.title`).toUpperCase()}`);
      sec.fields.forEach((f) => {
        const label = tf(`audit.f.${f.id}.label`);
        if (f.type === 'tabs') {
          TABS.forEach((tb) => { const v = val(`${f.id}_${tb.toLowerCase()}`); if (v) lines.push(`• Exemples ${tb} :\n${v}`); });
        } else if (f.type === 'file') {
          if (answers[f.id]) lines.push(`• ${label} : ${answers[f.id]}`);
        } else if (f.type === 'files') {
          const arr = answers[f.id] || [];
          if (arr.length) lines.push(`• ${label} (${arr.length}) :\n${arr.join('\n')}`);
        } else if (f.type === 'radio') {
          const v = val(f.id); if (v) lines.push(`• ${label} : ${tf(`audit.f.${f.id}.opt.${v}`)}`);
        } else {
          const v = val(f.id); if (v) lines.push(`• ${label} : ${v}`);
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
    if (!tsToken) { toast.error(t('audit.ui.robot')); return; }
    setSending(true);
    const recap = buildRecap();
    const marque = val('marque') || 'Sans nom';
    try {
      await onboardingService.submitAudit({ marque, email, answers: { ...answers, email }, recap, _hp: hpRef.current, cf_turnstile_token: tsToken });
      setModal({ type: 'success' });
    } catch (e) {
      // 403 = anti-bot refusé : le token est à usage unique, on réarme le widget.
      resetTurnstile();
      if (e?.response?.status === 403) { toast.error(t('audit.ui.antibot')); }
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
    const ph = f.ph ? t(`audit.f.${f.id}.ph`) : '';
    return (
      <div className="field" key={f.id}>
        <label>{t(`audit.f.${f.id}.label`)}{req}</label>
        {f.help && <p className="help">{t(`audit.f.${f.id}.help`, f.helpVars || {})}</p>}

        {f.type === 'text' && (
          <input type="text" value={answers[f.id] || ''} placeholder={ph} onChange={(e) => set(f.id, e.target.value)} />
        )}

        {f.type === 'textarea' && (
          <textarea value={answers[f.id] || ''} placeholder={ph} onChange={(e) => set(f.id, e.target.value)} />
        )}

        {f.type === 'radio' && (
          <div className="pills">
            {f.options.map((o) => (
              <label key={o}>
                <input type="radio" name={f.id} value={o} checked={answers[f.id] === o} onChange={() => set(f.id, o)} />
                <span className="pill">{t(`audit.f.${f.id}.opt.${o}`)}</span>
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
          const t2 = TABS[cur];
          return (
            <>
              <div className="tabs">
                {TABS.map((tb, k) => (
                  <button type="button" key={tb} className={k === cur ? 'on' : ''} onClick={() => setTabIdx((s) => ({ ...s, [f.id]: k }))}>{tb}</button>
                ))}
              </div>
              <div className="tabpane on">
                <textarea
                  value={answers[`${f.id}_${t2.toLowerCase()}`] || ''}
                  placeholder={t('audit.ui.tabsPh', { reseau: t2 })}
                  onChange={(e) => set(`${f.id}_${t2.toLowerCase()}`, e.target.value)}
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
                  <button type="button" aria-label={t('audit.ui.retirer')} onClick={() => removeUpload(f, answers[f.id])}>×</button>
                </div>
              </div>
            )}
            <label className={'uploadbtn' + (uploading[f.id] ? ' busy' : '')}>
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { doUpload(f, e.target.files); e.target.value = ''; }} />
              {uploading[f.id] ? t('audit.ui.envoi') : (answers[f.id] ? t('audit.ui.remplacerLogo') : t('audit.ui.importerLogo'))}
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
                      <button type="button" aria-label={t('audit.ui.retirer')} onClick={() => removeUpload(f, url)}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className={'uploadbtn' + (uploading[f.id] ? ' busy' : '') + (full ? ' disabled' : '')}>
                <input type="file" accept="image/*" multiple disabled={full || uploading[f.id]} style={{ display: 'none' }}
                  onChange={(e) => { doUpload(f, e.target.files); e.target.value = ''; }} />
                {uploading[f.id] ? t('audit.ui.envoi') : full ? t('audit.ui.maxAtteint', { n: MAX_IMAGES }) : t('audit.ui.ajouterImages')}
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
        <a href="/" className="tn-brand"><img src="/logo.png" alt="Postorico" /><span>Presence&nbsp;OS</span></a>
        <div className="tn-links">
          <a href="/fonctionnalites">{t('lp.nav.features')}</a>
          <a href="/comment-ca-marche">{t('lp.nav.how')}</a>
          <a href="/tarifs">{t('lp.nav.pricing')}</a>
          <a href="/faq">{t('lp.nav.faq')}</a>
        </div>
        <div className="tn-cta">
          <LangSwitcher />
          <a href="/login" className="tn-login">{t('lp.nav.login')}</a>
          <a href="/register" className="tn-start">{t('lp.nav.start')}</a>
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
            <img src="/logo.png" alt="Postorico" className="glyph" />
            <div><b>Presence&nbsp;OS</b><br /><span>{t('audit.ui.onboarding')}</span></div>
          </div>
          <h1>{t('audit.ui.h1a')}<br />{t('audit.ui.h1b')} <em>{t('audit.ui.h1em')}</em> {t('audit.ui.h1c')}</h1>
          <p className="lead">{t('audit.ui.lead')}</p>
          <div className="note">
            <div className="dot" />
            <div><span>{t('audit.ui.note')}</span></div>
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
                <span className="n">{num(i)}</span><span>{t(`audit.sec.${sec.id}.title`)}</span><span className="tick" />
              </a>
            ))}
          </nav>

          {/* FORM */}
          <main>
            {FORM.map((sec, i) => (
              <section className="block" id={sec.id} key={sec.id}>
                <div className="eyebrow">{num(i)} — {t('audit.ui.etape')}</div>
                <h2>{t(`audit.sec.${sec.id}.title`)}</h2>
                <p className="sub">{t(`audit.sec.${sec.id}.sub`)}</p>
                {sec.fields.map((f) => renderField(f))}
              </section>
            ))}

            {/* BLOC FINAL */}
            <section className="block finish">
              <div className="eyebrow">{t('audit.ui.finiEyebrow')}</div>
              <h2>{t('audit.ui.finiTitre')}</h2>
              <p className="sub" style={{ marginBottom: 22 }}>{t('audit.ui.finiSub')}</p>
              <div style={{ maxWidth: 380, margin: '0 auto 22px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{t('audit.ui.emailLabel')} <span style={{ color: 'var(--blue)' }}>*</span></label>
                <input type="text" value={senderEmail} placeholder={t('audit.ui.emailPh')}
                  onChange={(e) => { setSenderEmail(e.target.value); setEmailErr(false); }}
                  style={{ width: '100%', background: 'var(--input)', border: `1px solid ${emailErr ? 'var(--warn)' : 'var(--border)'}`, borderRadius: 11, color: 'var(--text)', font: 'inherit', fontSize: 14.5, padding: '12px 14px' }} />
              </div>
              <div ref={tsRef} className="ts" />
              <button className="btn primary" disabled={sending} onClick={submit} style={sending ? { opacity: 0.7 } : undefined}>
                {sending ? t('audit.ui.envoi') : t('audit.ui.envoyer')}
              </button>
            </section>
          </main>
        </div>
      </div>

      <footer className="wrap">
        <div>{t('audit.ui.footer')}</div>
        <div className="credit">Propulsé par GT BNB · Produit par Blackcore AI · Kraemer V · 78 bld Vitosha, Sofia</div>
      </footer>

      {/* MODALES */}
      {modal && (
        <div className="ov on" onClick={(e) => { if (e.currentTarget === e.target) setModal(null); }}>
          <div className="modal">
            {modal.type === 'success' ? (
              <>
                <div className="mh"><h3>{t('audit.ui.okTitre')}</h3><button className="x" onClick={() => setModal(null)}>×</button></div>
                <div className="mb"><p className="hint">{t('audit.ui.okBody')}</p></div>
                <div className="mf"><button className="btn primary" onClick={() => setModal(null)}>{t('audit.ui.fermer')}</button></div>
              </>
            ) : (
              <>
                <div className="mh"><h3>{t('audit.ui.fallbackTitre')}</h3><button className="x" onClick={() => setModal(null)}>×</button></div>
                <div className="mb">
                  <p className="hint">{t('audit.ui.fallbackBody')}</p>
                  <textarea readOnly value={modal.recap} />
                </div>
                <div className="mf">
                  <button className="btn ghost" onClick={downloadRecap}>{t('audit.ui.telecharger')}</button>
                  <button className="btn primary" onClick={copyRecap}>{copied ? t('audit.ui.copie') : t('audit.ui.copier')}</button>
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
