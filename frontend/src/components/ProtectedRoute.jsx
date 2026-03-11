import { Navigate } from 'react-router-dom';
import { isAuthenticated, isAdminAuthenticated } from '../lib/auth';

export const ProtectedRoute = ({ children }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return children;
};

export const AdminRoute = ({ children }) => {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return children;
};
