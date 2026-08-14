import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';

/**
 * Inscription à « La lettre de Rico » depuis le site public.
 * Route publique (aucun jeton) : POST /newsletter/abonner.
 * Une désinscription passée n'est jamais réactivée en douce — le serveur
 * répond « ok » sans rien changer, et l'on affiche le même message.
 */
export default function Newsletter() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [etat, setEtat] = useState('idle');   // idle | envoi | ok | erreur
  const [erreur, setErreur] = useState('');

  const soumettre = async (e) => {
    e.preventDefault();
    if (etat === 'envoi' || !email.trim()) return;
    setEtat('envoi'); setErreur('');
    try {
      await api.post('/newsletter/abonner', { email: email.trim() });
      setEtat('ok'); setEmail('');
    } catch (err) {
      setErreur(err.response?.data?.detail || t('lp.newsletter.erreur'));
      setEtat('erreur');
    }
  };

  return (
    <section className="nl-band">
      <div className="nl-inner">
        <div className="nl-txt">
          <span className="nl-kicker">{t('lp.newsletter.kicker')}</span>
          <h2>{t('lp.newsletter.titre')}</h2>
          <p>{t('lp.newsletter.sous')}</p>
        </div>

        {etat === 'ok' ? (
          <p className="nl-ok" role="status">✓ {t('lp.newsletter.merci')}</p>
        ) : (
          <form className="nl-form" onSubmit={soumettre} noValidate>
            <input
              type="email" required value={email} autoComplete="email"
              onChange={(e) => { setEmail(e.target.value); if (etat === 'erreur') setEtat('idle'); }}
              placeholder={t('lp.newsletter.placeholder')}
              aria-label={t('lp.newsletter.placeholder')}
            />
            <button type="submit" className="btn btn-grad sm" disabled={etat === 'envoi'}>
              {etat === 'envoi' ? t('lp.newsletter.envoi') : t('lp.newsletter.bouton')}
            </button>
          </form>
        )}
        {etat === 'erreur' && <p className="nl-err" role="alert">{erreur}</p>}
        <small className="nl-legal">{t('lp.newsletter.legal')}</small>
      </div>
    </section>
  );
}
