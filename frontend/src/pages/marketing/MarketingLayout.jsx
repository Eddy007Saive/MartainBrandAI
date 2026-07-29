import { useEffect } from 'react';
import { useNavigate, useLocation, Link, NavLink, Outlet } from 'react-router-dom';
import { isAuthenticated, isAdminAuthenticated } from '../../lib/auth';
import { isNativeApp } from '../../lib/appDownload';
import { CSS, GOODTIME } from './shared';

const LINKS = [
  { to: '/fonctionnalites', label: 'Fonctionnalités' },
  { to: '/comment-ca-marche', label: 'Comment ça marche' },
  { to: '/tarifs', label: 'Tarifs' },
  { to: '/faq', label: 'FAQ' },
];

export default function MarketingLayout() {
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
        <Link to="/" className="brand"><img src="/logo.png" alt="Postorico" /><div><b>Postorico</b><small>Studio de contenu IA</small></div></Link>
        <div className="navlinks">
          {LINKS.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
        </div>
        <div className="nav-cta"><Link className="login" to="/login">Se connecter</Link><Link className="btn btn-grad sm" to="/register">Commencer</Link></div>
      </div></nav>

      <div className="pagebody"><Outlet /></div>

      <footer><div className="wrap">
        <div className="brand">
          <img src="/logo.png" alt="" style={{ width: 30, height: 30 }} />
          <div>
            <b>Postorico</b>
            <small>Un produit <a href={GOODTIME.url} target="_blank" rel="noopener noreferrer">{GOODTIME.name} ↗</a> · © 2026</small>
          </div>
        </div>
        <div className="flinks">
          <Link to="/tarifs">Tarifs</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/cgu">CGU</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
          <a href={GOODTIME.url} target="_blank" rel="noopener noreferrer">{GOODTIME.name} ↗</a>
        </div>
      </div></footer>
    </div>
  );
}
