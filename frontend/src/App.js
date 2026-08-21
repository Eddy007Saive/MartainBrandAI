import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAffiliateRef } from "./hooks/useAffiliateRef";
import LangueParUrl from "./components/LangueParUrl";
import { PREFIXEES } from "./lib/langues";
import PopupRdv from "./components/PopupRdv";
import { Toaster } from "./components/ui/sonner";
import MarketingLayout from "./pages/marketing/MarketingLayout";
import HomeCine from "./pages/marketing/HomeCine";
import Features from "./pages/marketing/Features";
import HowItWorks from "./pages/marketing/HowItWorks";
import Pricing from "./pages/marketing/Pricing";
import Faq from "./pages/marketing/Faq";
import Cgu from "./pages/marketing/Cgu";
import Confidentialite from "./pages/marketing/Confidentialite";
import MentionsLegales from "./pages/marketing/MentionsLegales";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import AuditMarque from "./pages/AuditMarque";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DashboardLayout from "./layouts/DashboardLayout";
import AccueilPage from "./pages/AccueilPage";
import ContenusPage from "./pages/ContenusPage";
import StudioIA from "./pages/StudioIA";
import StudioVideo from "./pages/StudioVideo";
import StudioReel from "./pages/StudioReel";
import PlanEditorial from "./pages/PlanEditorial";
import CommentairesPage from "./pages/CommentairesPage";
import Performance from "./pages/Performance";
import PlanificationPage from "./pages/PlanificationPage";
import CarrouselsPage from "./pages/CarrouselsPage";
import Affiliation from "./pages/Affiliation";
import ParametresPage from "./pages/ParametresPage";
import Admin from "./pages/Admin";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

// Les pages publiques existent en trois langues. Le francais garde ses
// adresses actuelles ; l'anglais et l'espagnol sont prefixes. Le bloc est
// declare une fois et monte trois fois : une page ajoutee ici l'est dans les
// trois langues, sans recopie.
const routesPubliques = () => (
  <>
    <Route index element={<HomeCine />} />
    <Route element={<MarketingLayout />}>
      <Route path="fonctionnalites" element={<Features />} />
      <Route path="comment-ca-marche" element={<HowItWorks />} />
      <Route path="tarifs" element={<Pricing />} />
      <Route path="faq" element={<Faq />} />
      <Route path="cgu" element={<Cgu />} />
      <Route path="confidentialite" element={<Confidentialite />} />
      <Route path="mentions-legales" element={<MentionsLegales />} />
    </Route>
    <Route path="audit-marque" element={<AuditMarque />} />
    {/* Publiques et traduites, mais exclues de l'indexation par robots.txt :
        un visiteur espagnol qui clique « Empezar » depuis /es/tarifs doit
        trouver un formulaire en espagnol, pas un retour au francais. */}
    <Route path="login" element={<Login />} />
    <Route path="register" element={<Register />} />
    <Route path="pending" element={<Pending />} />
    <Route path="forgot-password" element={<ForgotPassword />} />
    <Route path="reset-password" element={<ResetPassword />} />
  </>
);

function App() {
  // Un visiteur peut arriver par un lien d'affiliation sur n'importe quelle
  // page : on capte le code partout, pas seulement sur l'inscription.
  useAffiliateRef();
  return (
    <div className="App">
      <BrowserRouter>
        {/* Proposition de rendez-vous apres une minute sur le site public.
            Le composant se tait de lui-meme partout ailleurs. */}
        <PopupRdv />
        {/* L'adresse fait foi pour la langue, et pose canonical + hreflang. */}
        <LangueParUrl />
        <Routes>
          {/* Francais : les adresses d'origine, inchangees. */}
          <Route path="/">{routesPubliques()}</Route>
          {/* Anglais et espagnol : les memes pages, prefixees. */}
          {PREFIXEES.map((l) => (
            <Route key={l} path={`/${l}`}>{routesPubliques()}</Route>
          ))}

          
          {/* Dashboard routes with layout */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AccueilPage />} />
            <Route path="studio" element={<StudioIA />} />
            <Route path="video" element={<StudioVideo />} />
            <Route path="reel" element={<StudioReel />} />
            <Route path="plan" element={<PlanEditorial />} />
            <Route path="contenus" element={<ContenusPage />} />
            <Route path="commentaires" element={<CommentairesPage />} />
            <Route path="performance" element={<Performance />} />
            <Route path="planification" element={<PlanificationPage />} />
            <Route path="carrousels" element={<CarrouselsPage />} />
            <Route path="affiliation" element={<Affiliation />} />
            <Route path="affiliation" element={<Affiliation />} />
            <Route path="parametres" element={<ParametresPage />} />
          </Route>
          
          <Route 
            path="/admin" 
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
