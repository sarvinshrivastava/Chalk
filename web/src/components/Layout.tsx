import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Layout.css";

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="layout">
      <header className="header">
        <NavLink to="/" className="logo">
          ch<span className="logo-accent">a</span>lk
        </NavLink>
        {user && (
          <div className="header-actions">
            <span className="header-email">{user.email}</span>
            <button className="btn-ghost" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
