import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import DashboardLayout from "./layouts/DashboardLayout";
import AccueilPage from "./pages/AccueilPage";
import ContenusPage from "./pages/ContenusPage";
import CommentairesPage from "./pages/CommentairesPage";
import PlanificationPage from "./pages/PlanificationPage";
import ParametresPage from "./pages/ParametresPage";
import Admin from "./pages/Admin";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending" element={<Pending />} />
          
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
            <Route path="contenus" element={<ContenusPage />} />
            <Route path="commentaires" element={<CommentairesPage />} />
            <Route path="planification" element={<PlanificationPage />} />
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
