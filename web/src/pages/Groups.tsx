import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import "./Groups.css";

interface Group {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export default function Groups() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchGroups = async () => {
    const { data } = await supabase
      .from("group_members")
      .select("group_id, groups(id, name, created_by, created_at)")
      .eq("user_id", user!.id)
      .order("joined_at", { ascending: false } as any);

    const list = (data ?? [])
      .map((row: any) => row.groups as Group)
      .filter(Boolean);
    setGroups(list);
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    // Use RPC function to create group + add creator as member atomically
    const { data: groupId, error } = await supabase
      .rpc("create_group_with_member", { group_name: newName.trim() });

    if (!error && groupId) {
      setNewName("");
      setShowCreate(false);
      fetchGroups();
    }
    setCreating(false);
  };

  const handleDelete = async (groupId: string, groupName: string) => {
    if (!confirm(`Delete "${groupName}"? This will remove all expenses and members.`)) {
      return;
    }

    const { error } = await supabase.rpc("delete_group", {
      target_group_id: groupId,
    });

    if (!error) {
      fetchGroups();
    }
  };

  if (loading) return <p>Loading groups...</p>;

  return (
    <div className="groups-page">
      <div className="groups-header">
        <h2>Your Groups</h2>
        <button
          className="btn btn-primary"
          style={{ width: "auto", padding: "8px 16px", fontSize: "0.9rem" }}
          onClick={() => setShowCreate(true)}
        >
          + New group
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card create-group-form">
          <div className="form-group">
            <label>Group name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Koramangala Crew"
              maxLength={50}
              autoFocus
              required
            />
          </div>
          <div className="create-group-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creating}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}

      {groups.length === 0 ? (
        <div className="empty-state">
          <p>No groups yet. Create one to start splitting!</p>
        </div>
      ) : (
        <div className="groups-list">
          {groups.map((g) => (
            <div key={g.id} className="group-card card">
              <Link to={`/group/${g.id}`} className="group-card-link">
                <div className="group-card-name">{g.name}</div>
                <div className="group-card-meta">
                  Created {new Date(g.created_at).toLocaleDateString("en-IN")}
                </div>
              </Link>
              {g.created_by === user?.id && (
                <button
                  className="group-delete-btn"
                  title="Delete group"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(g.id, g.name);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4.5 2V1.5C4.5 0.672 5.172 0 6 0h4c.828 0 1.5.672 1.5 1.5V2h3a.5.5 0 010 1h-.554l-.675 10.81A1.5 1.5 0 0111.78 15H4.22a1.5 1.5 0 01-1.491-1.19L2.054 3H1.5a.5.5 0 010-1h3zm1 0h5v-.5a.5.5 0 00-.5-.5H6a.5.5 0 00-.5.5V2zM3.06 3l.662 10.607a.5.5 0 00.497.393h7.562a.5.5 0 00.497-.393L12.94 3H3.06z" fill="currentColor"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
