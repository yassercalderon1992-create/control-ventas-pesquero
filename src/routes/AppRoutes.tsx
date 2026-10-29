import { Navigate, Route, Routes } from "react-router-dom";

import LoginPage from "../Login/LoginPage";
import DashboardPage from "../Dashboard/DashboardPage";
import InventoryPage from "../Inventory/InventoryPage";
import MovementsPage from "../Movements/MovementsPage";
import ReportsPage from "../Reports/ReportsPage";
import AdminPage from "../Admin/AdminPage";
import OperationsPage from "../Operations/OperationsPage";
import CashExpensesPage from "../Finance/CashExpensesPage";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "../hooks/useAuth";

export function AppRoutes() {
  const { authenticated } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute isAuthenticated={authenticated}><DashboardPage /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute isAuthenticated={authenticated}><InventoryPage /></ProtectedRoute>} />
      <Route path="/operations" element={<ProtectedRoute isAuthenticated={authenticated}><OperationsPage /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute isAuthenticated={authenticated}><CashExpensesPage /></ProtectedRoute>} />
      <Route path="/movements" element={<ProtectedRoute isAuthenticated={authenticated}><MovementsPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute isAuthenticated={authenticated}><ReportsPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute isAuthenticated={authenticated}><AdminPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
