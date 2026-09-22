import { ReactNode } from "react";

import Header from "./Header";
import Sidebar from "./Sidebar";

import "./layout.css";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({
  children,
}: MainLayoutProps) {
  return (
    <div className="layout">
      <Header />

      <div className="layout-body">
        <Sidebar />

        <main className="layout-content">
          {children}
        </main>
      </div>
    </div>
  );
}