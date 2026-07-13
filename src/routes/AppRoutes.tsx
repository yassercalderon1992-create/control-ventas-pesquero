import { Routes, Route } from "react-router-dom";

import LoginPage from "../pages/LoginPage";
import DashboardPage from "../pages/DashboardPage";
import InventoryPage from "../pages/InventoryPage";
import MovementsPage from "../pages/MovementsPage";
import ReportsPage from "../pages/ReportsPage";
import AdminPage from "../pages/AdminPage";

export function AppRoutes() {

    return (

        <Routes>

            <Route path="/" element={<LoginPage/>} />

            <Route path="/dashboard" element={<DashboardPage/>} />

            <Route path="/inventory" element={<InventoryPage/>} />

            <Route path="/movements" element={<MovementsPage/>} />

            <Route path="/reports" element={<ReportsPage/>} />

            <Route path="/admin" element={<AdminPage/>} />

        </Routes>

    )

}