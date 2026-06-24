import { useEffect } from 'react';
import { useNavigate, useLocation, Link, NavLink, Outlet } from 'react-router-dom';
import { isAuthenticated, isAdminAuthenticated } from '../../lib/auth';
import { isNativeApp } from '../../lib/appDownload';
import { CSS } from './shared';

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

  if (skip) return null;

  return (
    <div className="lp">
      <style>{CSS}</style>

      <nav><div className="wrap">
        <Link to="/" className="brand"><img src="/logo.png" alt="Presence OS" /><div><b>Presence OS</b><small>Studio de contenu IA</small></div></Link>
        <div className="navlinks">
          {LINKS.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
        </div>
        <div className="nav-cta"><Link className="login" to="/login">Se connecter</Link><Link className="btn btn-grad sm" to="/register">Commencer</Link></div>
      </div></nav>

      <div className="pagebody"><Outlet /></div>

      <footer><div className="wrap">
        <div className="brand"><img src="/logo.png" alt="" style={{ width: 30, height: 30 }} /><div><b>Presence OS</b><small>© 2026 · Studio de contenu IA</small></div></div>
        <div className="flinks">
          <Link to="/fonctionnalites">Fonctionnalités</Link>
          <Link to="/tarifs">Tarifs</Link>
          <Link to="/faq">FAQ</Link>
          <Link to="/login">Connexion</Link>
          <Link to="/register">Inscription</Link>
        </div>
      </div></footer>
    </div>
  );
}
