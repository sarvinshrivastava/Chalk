import { useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useGroups } from "../hooks/useGroups";
import { GROUP_NAME_MAX_LENGTH } from "@chalk/shared";
import TrashIcon from "./icons/TrashIcon";
import "./GroupsSidebar.css";

export default function GroupsSidebar() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const { groups, loading, createGroup, deleteGroup } = useGroups();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createGroup(newName.trim());
      setNewName("");
      setShowCreate(false);
    } catch {
      // Error handled silently in sidebar
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (
    e: React.MouseEvent,
    id: string,
    name: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${name}"? This removes all expenses and members.`))
      return;
    await deleteGroup(id);
  };

  if (loading) {
    return (
      <div className="sidebar-loading">
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <nav className="groups-sidebar">
      <div className="sidebar-header">
        <h3>Groups</h3>
        <button
          className="sidebar-add-btn"
          title="New group"
          onClick={() => setShowCreate(!showCreate)}
        >
          +
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="sidebar-create-form">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Group name..."
            maxLength={GROUP_NAME_MAX_LENGTH}
            autoFocus
            required
          />
          <div className="sidebar-create-actions">
            <button
              type="button"
              className="sidebar-cancel-btn"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sidebar-submit-btn"
              disabled={creating}
            >
              {creating ? "..." : "Create"}
            </button>
          </div>
        </form>
      )}

      <div className="sidebar-list">
        {groups.length === 0 ? (
          <p className="sidebar-empty">No groups yet</p>
        ) : (
          groups.map((g) => (
            <NavLink
              key={g.id}
              to={`/group/${g.id}`}
              className={({ isActive }) =>
                `sidebar-item ${isActive ? "active" : ""}`
              }
            >
              <span className="sidebar-item-name">{g.name}</span>
              {g.created_by === user?.id && (
                <button
                  className="sidebar-item-delete"
                  title="Delete group"
                  onClick={(e) => handleDelete(e, g.id, g.name)}
                >
                  <TrashIcon size={12} />
                </button>
              )}
            </NavLink>
          ))
        )}
      </div>
    </nav>
  );
}
