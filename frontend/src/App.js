import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import MarketingLayout from "./pages/marketing/MarketingLayout";
import Home from "./pages/marketing/Home";
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
import PlanEditorial from "./pages/PlanEditorial";
import CommentairesPage from "./pages/CommentairesPage";
import Performance from "./pages/Performance";
import PlanificationPage from "./pages/PlanificationPage";
import CarrouselsPage from "./pages/CarrouselsPage";
import ParametresPage from "./pages/ParametresPage";
import Admin from "./pages/Admin";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          {/* Site vitrine (pages séparées, layout commun) */}
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/fonctionnalites" element={<Features />} />
            <Route path="/comment-ca-marche" element={<HowItWorks />} />
            <Route path="/tarifs" element={<Pricing />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/cgu" element={<Cgu />} />
            <Route path="/confidentialite" element={<Confidentialite />} />
            <Route path="/mentions-legales" element={<MentionsLegales />} />
          </Route>

          <Route path="/audit-marque" element={<AuditMarque />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
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
            <Route path="plan" element={<PlanEditorial />} />
            <Route path="contenus" element={<ContenusPage />} />
            <Route path="commentaires" element={<CommentairesPage />} />
            <Route path="performance" element={<Performance />} />
            <Route path="planification" element={<PlanificationPage />} />
            <Route path="carrousels" element={<CarrouselsPage />} />
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
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
