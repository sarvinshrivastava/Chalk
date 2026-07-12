import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchDashboardLayout,
  saveDashboardLayout,
  resetDashboardLayout,
  fetchDashboardData,
  type DashboardData,
  type WidgetInstance,
} from "../lib/services/dashboard";
import { getErrorMessage } from "../lib/format";

const LS_LAYOUT_KEY = "chalk-dashboard-layout";
const LS_SYNC_KEY = "chalk-dashboard-sync";
const DEBOUNCE_MS = 500;

function getLocalLayout(): WidgetInstance[] | null {
  try {
    const raw = localStorage.getItem(LS_LAYOUT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalLayout(layout: WidgetInstance[]) {
  localStorage.setItem(LS_LAYOUT_KEY, JSON.stringify(layout));
}

function isSyncEnabled(): boolean {
  return localStorage.getItem(LS_SYNC_KEY) !== "false";
}

export function useDashboard() {
  const [layout, setLayout] = useState<WidgetInstance[]>(
    () => getLocalLayout() ?? [],
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const loadLayout = useCallback(async () => {
    if (!isSyncEnabled()) return;
    try {
      const remote = await fetchDashboardLayout();
      setLayout(remote.layout);
      setLocalLayout(remote.layout);
    } catch {
      // Use local layout as fallback
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const result = await fetchDashboardData();
      setData(result);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLayout();
    loadData();
  }, [loadLayout, loadData]);

  const updateLayout = useCallback((newLayout: WidgetInstance[]) => {
    setLayout(newLayout);
    setLocalLayout(newLayout);
    if (isSyncEnabled()) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveDashboardLayout(newLayout).catch(() => {});
      }, DEBOUNCE_MS);
    }
  }, []);

  const addWidget = useCallback(
    (instance: WidgetInstance) => {
      updateLayout([...layout, instance]);
    },
    [layout, updateLayout],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      updateLayout(layout.filter((w) => w.id !== widgetId));
    },
    [layout, updateLayout],
  );

  const updateWidgetConfig = useCallback(
    (widgetId: string, config: Record<string, string | boolean>) => {
      updateLayout(
        layout.map((w) => (w.id === widgetId ? { ...w, config } : w)),
      );
    },
    [layout, updateLayout],
  );

  const resetToDefault = useCallback(async () => {
    try {
      await resetDashboardLayout();
      localStorage.removeItem(LS_LAYOUT_KEY);
      const remote = await fetchDashboardLayout();
      setLayout(remote.layout);
      setLocalLayout(remote.layout);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    loadData();
  }, [loadData]);

  return {
    layout,
    data,
    loading,
    error,
    updateLayout,
    addWidget,
    removeWidget,
    updateWidgetConfig,
    resetToDefault,
    retry,
  };
}
