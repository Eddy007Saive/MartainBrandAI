import "@/App.css";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAffiliateRef } from "./hooks/useAffiliateRef";
import LangueParUrl from "./components/LangueParUrl";
import { PREFIXEES } from "./lib/langues";
import PopupRdv from "./components/PopupRdv";
import { Toaster } from "./components/ui/sonner";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

// Chargement à la demande, par route : la page d'accueil vitrine n'a aucune
// raison de télécharger le code du tableau de bord (Studio IA, Contenus...),
// et inversement. Chaque import() devient son propre fragment JS, chargé
// seulement quand la route correspondante est visitée.
const MarketingLayout = lazy(() => import("./pages/marketing/MarketingLayout"));
const HomeCine = lazy(() => import("./pages/marketing/HomeCine"));
const Features = lazy(() => import("./pages/marketing/Features"));
const HowItWorks = lazy(() => import("./pages/marketing/HowItWorks"));
const Pricing = lazy(() => import("./pages/marketing/Pricing"));
const Faq = lazy(() => import("./pages/marketing/Faq"));
const Blog = lazy(() => import("./pages/marketing/Blog"));
const Article = lazy(() => import("./pages/marketing/Article"));
const Pourquoi = lazy(() => import("./pages/marketing/Pourquoi"));
const Cgu = lazy(() => import("./pages/marketing/Cgu"));
const Confidentialite = lazy(() => import("./pages/marketing/Confidentialite"));
const MentionsLegales = lazy(() => import("./pages/marketing/MentionsLegales"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Pending = lazy(() => import("./pages/Pending"));
const AuditMarque = lazy(() => import("./pages/AuditMarque"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));
const AccueilPage = lazy(() => import("./pages/AccueilPage"));
const ContenusPage = lazy(() => import("./pages/ContenusPage"));
const StudioIA = lazy(() => import("./pages/StudioIA"));
const StudioVideo = lazy(() => import("./pages/StudioVideo"));
const StudioReel = lazy(() => import("./pages/StudioReel"));
const PlanEditorial = lazy(() => import("./pages/PlanEditorial"));
const CommentairesPage = lazy(() => import("./pages/CommentairesPage"));
const Performance = lazy(() => import("./pages/Performance"));
const PlanificationPage = lazy(() => import("./pages/PlanificationPage"));
const CarrouselsPage = lazy(() => import("./pages/CarrouselsPage"));
const Affiliation = lazy(() => import("./pages/Affiliation"));
const ParametresPage = lazy(() => import("./pages/ParametresPage"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));

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
      {/* Le blog partage la mise en page marketing : c'est elle qui porte le
          menu et le pied de page, donc les liens internes vers les pages
          produit. Un article isole ne transmettrait rien. */}
      <Route path="blog" element={<Blog />} />
      <Route path="blog/:slug" element={<Article />} />
      <Route path="cgu" element={<Cgu />} />
      <Route path="confidentialite" element={<Confidentialite />} />
      <Route path="mentions-legales" element={<MentionsLegales />} />
    </Route>
    <Route path="audit-marque" element={<AuditMarque />} />
    {/* Page de démarchage envoyée en lien direct : pas dans le menu, propre
        header réduit, exclue de l'indexation (robots.txt). */}
    <Route path="pourquoi" element={<Pourquoi />} />
    {/* Publiques et traduites, mais exclues de l'indexation par robots.txt :
        un visiteur espagnol qui clique « Empezar » depuis /es/tarifs doit
        trouver un formulaire en espagnol, pas un retour au francais. */}
    <Route path="login" element={<Login />} />
    <Route path="register" element={<Register />} />
    <Route path="pending" element={<Pending />} />
    <Route path="forgot-password" element={<ForgotPassword />} />
    <Route path="reset-password" element={<ResetPassword />} />
    {/* Tout le reste : une page introuvable, dans la langue de l'adresse.
        Sans elle, une faute de frappe donnait un ecran entierement blanc. */}
    <Route path="*" element={<NotFound />} />
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
        <Suspense fallback={null}>
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
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
