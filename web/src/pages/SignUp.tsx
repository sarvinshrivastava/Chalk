import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./Auth.css";

export default function SignUp() {
  const { user, signUp, signInWithGoogle } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp(email, password, name);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-logo">
            ch<span className="logo-accent">a</span>lk
          </h1>
          <h2>Check your email</h2>
          <p style={{ color: "var(--ink-muted)", marginTop: 8 }}>
            We sent a confirmation link to <strong>{email}</strong>
          </p>
          <Link
            to="/login"
            className="btn btn-primary btn--full"
            style={{ marginTop: 24 }}
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-logo">
          ch<span className="logo-accent">a</span>lk
        </h1>
        <p className="auth-tagline">Keep score. Stay even.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              minLength={6}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn--full"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          className="btn btn-outline btn--full"
          onClick={signInWithGoogle}
        >
          Continue with Google
        </button>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
