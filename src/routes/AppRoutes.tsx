import { Routes, Route } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";

import { useAuth } from "../hooks/useAuth";

import LoginPage from "../Login/LoginPage";
import DashboardPage from "../Dashboard/DashboardPage";
import InventoryPage from "../Inventory/InventoryPage";
import MovementsPage from "../Movements/MovementsPage";
import ReportsPage from "../Reports/ReportsPage";
import AdminPage from "../Admin/AdminPage";

export function AppRoutes() {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return <h2>Cargando...</h2>;
  }

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute isAuthenticated={authenticated}>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/inventory"
        element={
          <ProtectedRoute isAuthenticated={authenticated}>
            <InventoryPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/movements"
        element={
          <ProtectedRoute isAuthenticated={authenticated}>
            <MovementsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedRoute isAuthenticated={authenticated}>
            <ReportsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute isAuthenticated={authenticated}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}