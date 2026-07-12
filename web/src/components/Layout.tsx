import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import GroupsSidebar from "./GroupsSidebar";
import "./Layout.css";

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="desktop-shell">
      <header className="topbar">
        <button
          className="hamburger-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <NavLink to="/" className="logo">
          ch<span className="logo-accent">a</span>lk
        </NavLink>
        {user && (
          <div className="topbar-actions">
            <span className="topbar-email">{user.email}</span>
            <button className="btn-ghost" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <aside className="sidebar">
        <GroupsSidebar />
      </aside>
      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}
      <aside className={`drawer ${drawerOpen ? "drawer--open" : ""}`}>
        <GroupsSidebar />
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
