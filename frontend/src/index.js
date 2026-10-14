import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
// Polices auto-hébergées (remplacent le lien Google Fonts de public/index.html) :
// mêmes graisses qu'avant, fichiers woff2 latin servis depuis /static/media.
import "@fontsource/sora/400.css";
import "@fontsource/sora/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/sora/800.css"; // homeCine.css
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@/i18n"; // langue de l'interface : localStorage → navigateur → fr
import App from "@/App";
import { hydrateAuth } from "@/lib/auth";
import { initAnalytics } from "@/lib/analytics";
import { Capacitor } from "@capacitor/core";
import { initSentry, optionsRacine } from "@/lib/sentry";

// Sentry en premier : une erreur du tout premier rendu doit aussi remonter.
initSentry();

// Natif (APK/iOS) : l'app ne doit PAS ouvrir sur la home marketing. Elle
// cold-start toujours sur "/" (index.html embarque) → on redirige vers le
// login AVANT le premier rendu. Login renvoie ensuite vers /dashboard si un
// jeton valide existe. Le web garde "/" = site marketing (SEO).
if (Capacitor.isNativePlatform()) {
  const p = window.location.pathname;
  if (p === "/" || p === "" || p.endsWith("/index.html")) {
    window.history.replaceState(null, "", "/login");
  }
}

// PostHog télécharge lui-même ses modules lourds (enregistrement de session,
// sondages) dès l'appel à init() : les lancer ici, avant le premier rendu,
// leur fait concurrencer les ressources critiques de la page pendant la
// fenêtre la plus surveillée (LCP). Un report après le chargement complet ne
// coûte rien à la mesure — quelques centaines de ms sur une session dure
// souvent des minutes — et libère la bande passante initiale pour la page.
const demarrerAnalytics = () => setTimeout(initAnalytics, 1000);
if (document.readyState === "complete") demarrerAnalytics();
else window.addEventListener("load", demarrerAnalytics, { once: true });

const conteneur = document.getElementById("root");

// HTML prerendu de la page (scripts/prerendu.js), tel que le navigateur vient
// de l'afficher. Les pages sont chargees en React.lazy : pendant que leur
// morceau de JavaScript arrive, App l'affiche tel quel en guise de fallback
// de <Suspense>, au lieu d'un ecran vide. Vide dans l'app native (voir plus bas).
const htmlPrerendu = Capacitor.isNativePlatform() ? "" : conteneur.innerHTML;

const arbre = (
  <React.StrictMode>
    <App htmlPrerendu={htmlPrerendu} />
  </React.StrictMode>
);

// Les pages publiques sont prerendues (scripts/prerendu.js) : leur HTML est
// deja dans le fichier, c'est lui que lisent les robots qui n'executent pas
// JavaScript.
//
// On le REMPLACE au lieu de l'hydrater, volontairement. L'hydratation exige
// que le premier rendu client soit identique au HTML au caractere pres ; ces
// composants n'ont jamais ete ecrits pour ca, et React signalait un decalage
// (erreur 418) sur chaque page — apres quoi il redessinait de toute facon le
// sous-arbre fautif. On paie donc le meme rendu, sans les avertissements ni
// le risque d'une page a moitie hydratee.
//
// Ce qu'on perd : rien pour les robots, qui ne lisent que le HTML. Pour un
// visiteur, un remplacement imperceptible — le DOM redessine est identique.
//
// Le vidage sert aussi au natif : l'APK embarque le meme build, donc le meme
// HTML prerendu, et l'accueil francais clignoterait avant l'ecran attendu.
// Octobre 2026 : sur le web, on ne vide PLUS le conteneur avant le rendu.
// Le HTML prerendu reste affiche jusqu'a ce que React dessine le sien (React
// remplace les enfants du conteneur au premier render) : le visiteur voit la
// page des le premier octet au lieu d'un ecran vide pendant le telechargement
// et l'execution du JavaScript. Lighthouse mesurait le LCP a l'apparition du
// rendu React (plusieurs secondes sur mobile) ; il est maintenant mesure sur
// le HTML prerendu. Le vidage reste necessaire dans l'APK (voir ci-dessus).
if (Capacitor.isNativePlatform()) conteneur.innerHTML = "";
const root = ReactDOM.createRoot(conteneur, optionsRacine);

// Sur mobile : recharger le jeton depuis le stockage natif AVANT de rendre,
// sinon ProtectedRoute renvoie au login au demarrage. No-op sur le web.
hydrateAuth().finally(() => root.render(arbre));
