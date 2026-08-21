import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "@/i18n"; // langue de l'interface : localStorage → navigateur → fr
import App from "@/App";
import { hydrateAuth } from "@/lib/auth";
import { initAnalytics } from "@/lib/analytics";

initAnalytics();

const conteneur = document.getElementById("root");
const arbre = (
  <React.StrictMode>
    <App />
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
conteneur.innerHTML = "";
const root = ReactDOM.createRoot(conteneur);

// Sur mobile : recharger le jeton depuis le stockage natif AVANT de rendre,
// sinon ProtectedRoute renvoie au login au demarrage. No-op sur le web.
hydrateAuth().finally(() => root.render(arbre));
