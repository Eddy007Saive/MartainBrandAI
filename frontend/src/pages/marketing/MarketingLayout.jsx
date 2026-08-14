import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, Link, NavLink, Outlet } from 'react-router-dom';
import { isAuthenticated, isAdminAuthenticated } from '../../lib/auth';
import { isNativeApp } from '../../lib/appDownload';
import LangSwitcher from '../../components/LangSwitcher';
import { CSS, GOODTIME } from './shared';
import Newsletter from './Newsletter';

const LINKS = [
  { to: '/fonctionnalites', labelKey: 'lp.nav.features' },
  { to: '/comment-ca-marche', labelKey: 'lp.nav.howItWorks' },
  { to: '/tarifs', labelKey: 'lp.nav.pricing' },
  { to: '/faq', labelKey: 'lp.nav.faq' },
];

export default function MarketingLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Pas de site vitrine dans l'app native ni pour un utilisateur connecté
  const skip = isNativeApp() || isAuthenticated() || isAdminAuthenticated();

  useEffect(() => {
    if (isAdminAuthenticated()) navigate('/admin', { replace: true });
    else if (isAuthenticated()) navigate('/dashboard', { replace: true });
    else if (isNativeApp()) navigate('/login', { replace: true });
  }, [navigate]);

  // Remonter en haut à chaque changement de page
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Reveal au scroll : la gate .anim n'est posée qu'une fois le JS prêt (pas de flash sans JS),
  // puis chaque bloc de section apparaît à son entrée dans le viewport (une seule fois).
  useEffect(() => {
    if (skip) return;
    const root = document.querySelector('.lp');
    if (!root) return;
    root.classList.add('anim');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '-40px' });
    const observe = () => document.querySelectorAll('.lp section .wrap > *:not(.in)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) el.classList.add('in'); // déjà visible -> pas d'attente
      else io.observe(el);
    });
    observe();
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, skip]);

  if (skip) return null;

  return (
    <div className="lp">
      <style>{CSS}</style>

      <nav><div className="wrap">
        <Link to="/" className="brand"><img src="/logo.png" alt="Postorico" /><div><b>Postorico</b><small>{t('lp.nav.tagline')}</small></div></Link>
        <div className="navlinks">
          {LINKS.map((l) => <NavLink key={l.to} to={l.to}>{t(l.labelKey)}</NavLink>)}
        </div>
        <div className="nav-cta"><LangSwitcher /><Link className="login" to="/login">{t('lp.nav.login')}</Link><Link className="btn btn-grad sm" to="/register">{t('lp.nav.start')}</Link></div>
      </div></nav>

      <div className="pagebody"><Outlet /></div>

      <Newsletter />

      <footer><div className="wrap">
        <div className="brand">
          <img src="/logo.png" alt="" style={{ width: 30, height: 30 }} />
          <div>
            <b>Postorico</b>
            <small>{t('lp.footer.productOf')} <a href={GOODTIME.url} target="_blank" rel="noopener noreferrer">{GOODTIME.name} ↗</a> · © 2026</small>
          </div>
        </div>
        <div className="flinks">
          <Link to="/tarifs">{t('lp.footer.pricing')}</Link>
          <Link to="/faq">{t('lp.footer.faq')}</Link>
          <Link to="/cgu">{t('lp.footer.cgu')}</Link>
          <Link to="/confidentialite">{t('lp.footer.privacy')}</Link>
          <Link to="/mentions-legales">{t('lp.footer.legal')}</Link>
          <a href={GOODTIME.url} target="_blank" rel="noopener noreferrer">{GOODTIME.name} ↗</a>
        </div>
      </div></footer>
    </div>
  );
}
