import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { WidgetCard, WidgetSkeleton } from "./WidgetCard";
import type {
  WidgetInstance,
  DashboardData,
} from "../../lib/services/dashboard";
import "./BentoGrid.css";

interface BentoGridProps {
  layout: WidgetInstance[];
  data: DashboardData | null;
  editMode: boolean;
  onLayoutChange: (layout: WidgetInstance[]) => void;
  onRemoveWidget: (id: string) => void;
  onUpdateConfig: (
    id: string,
    config: Record<string, string | boolean>,
  ) => void;
  loading: boolean;
}

function useColumns(): number {
  const getColumns = useCallback(() => {
    const w = window.innerWidth;
    if (w >= 1024) return 3;
    if (w >= 768) return 2;
    return 1;
  }, []);

  const [cols, setCols] = useState(getColumns);

  useEffect(() => {
    function handleResize() {
      setCols(getColumns());
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getColumns]);

  return cols;
}

/** Clamp widget span to fit current column count */
function clampSpan(span: number, cols: number): number {
  return Math.min(span, cols);
}

const SKELETON_SIZES = [
  { w: 3, h: 1 },
  { w: 2, h: 2 },
  { w: 1, h: 2 },
  { w: 1, h: 1 },
  { w: 1, h: 1 },
  { w: 2, h: 1 },
];

export default function BentoGrid({
  layout,
  data,
  editMode,
  onLayoutChange,
  onRemoveWidget,
  onUpdateConfig,
  loading,
}: BentoGridProps) {
  const cols = useColumns();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = layout.findIndex((w) => w.id === active.id);
    const newIndex = layout.findIndex((w) => w.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onLayoutChange(arrayMove(layout, oldIndex, newIndex));
    }
  }

  const gridClass = `bento-grid bento-grid--cols-${cols}${editMode ? " bento-grid--edit" : ""}`;

  // Loading skeletons
  if (loading) {
    return (
      <div className={gridClass}>
        {SKELETON_SIZES.map((size, i) => (
          <WidgetSkeleton key={i} w={clampSpan(size.w, cols)} h={size.h} />
        ))}
      </div>
    );
  }

  // No data yet
  if (!data) return null;

  const items = layout.map((w) => w.id);

  const gridContent = layout.map((widget) => (
    <WidgetCard
      key={widget.id}
      widget={{
        ...widget,
        position: {
          ...widget.position,
          w: clampSpan(widget.position.w, cols),
        },
      }}
      data={data}
      editMode={editMode}
      onRemove={onRemoveWidget}
      onUpdateConfig={onUpdateConfig}
    />
  ));

  // In edit mode, wrap with DndContext for drag-and-drop
  if (editMode) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items} strategy={rectSortingStrategy}>
          <div className={gridClass}>{gridContent}</div>
        </SortableContext>
      </DndContext>
    );
  }

  // View mode: static grid
  return <div className={gridClass}>{gridContent}</div>;
}
