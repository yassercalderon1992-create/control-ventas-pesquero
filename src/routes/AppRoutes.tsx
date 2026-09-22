import { Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "../Login/LoginPage";

import DashboardPage from "../Dashboard/DashboardPage";
import InventoryPage from "../Inventory/InventoryPage";
import MovementsPage from "../Movements/MovementsPage";
import ReportsPage from "../Reports/ReportsPage";
import AdminPage from "../Admin/AdminPage";

import ProtectedRoute from "./ProtectedRoute";

export function AppRoutes() {
  return (
    <Routes>

      <Route path="/" element={<LoginPage />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <InventoryPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/movements"
        element={
          <ProtectedRoute>
            <MovementsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />

    </Routes>
  );
}