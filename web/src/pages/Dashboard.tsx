import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useDashboard } from "../hooks/useDashboard";
import BentoGrid from "../components/dashboard/BentoGrid";
import { WidgetPicker } from "../components/dashboard/WidgetPicker";
import "./Dashboard.css";

export default function Dashboard() {
  const { user } = useAuth();
  const {
    layout,
    data,
    loading,
    error,
    updateLayout,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    retry,
  } = useDashboard();
  const [editMode, setEditMode] = useState(false);

  // Zero-groups state
  if (!loading && data && data.groups.length === 0) {
    return (
      <div className="dashboard dashboard--centered">
        <div className="dashboard-welcome">
          <h1>
            Welcome to ch<span className="logo-accent">a</span>lk
          </h1>
          <p className="dashboard-subtitle">
            {user?.email
              ? `Signed in as ${user.email}`
              : "Split expenses with friends, hassle-free."}
          </p>
        </div>
        <div className="dashboard-prompt card">
          <h2>Select a group to get started</h2>
          <p>
            Pick a group from the sidebar, or create a new one to begin tracking
            shared expenses.
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="dashboard dashboard--centered">
        <div className="dashboard-error card">
          <h2>Failed to load dashboard</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={retry}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button
          className={`btn ${editMode ? "btn-primary" : "btn-outline"}`}
          onClick={() => setEditMode(!editMode)}
        >
          {editMode ? "Done" : "Edit"}
        </button>
      </div>

      {layout.length === 0 && !loading && (
        <div className="dashboard-empty card">
          <p>Your dashboard is empty. Click the edit button to add widgets.</p>
        </div>
      )}

      <BentoGrid
        layout={layout}
        data={data}
        editMode={editMode}
        onLayoutChange={updateLayout}
        onRemoveWidget={removeWidget}
        onUpdateConfig={updateWidgetConfig}
        loading={loading}
      />

      {editMode && (
        <WidgetPicker currentLayout={layout} onAddWidget={addWidget} />
      )}
    </div>
  );
}
