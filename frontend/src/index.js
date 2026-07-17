import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import "@/i18n"; // langue de l'interface : localStorage → navigateur → fr
import App from "@/App";
import { hydrateAuth } from "@/lib/auth";

const root = ReactDOM.createRoot(document.getElementById("root"));

// Sur mobile : recharge le token depuis le stockage natif AVANT le rendu
// (sinon ProtectedRoute redirige vers le login au démarrage). No-op sur le web.
hydrateAuth().finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
