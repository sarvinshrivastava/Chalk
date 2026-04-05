import React from "react";
import type { WidgetDefinition, WidgetProps } from "./types";
import { NetBalance } from "./NetBalance";
import { SpendingByGroup } from "./SpendingByGroup";
import { SpendingPie } from "./SpendingPie";
import { TopDebtor } from "./TopDebtor";
import { YouOweMost } from "./YouOweMost";
import { RecentExpenses } from "./RecentExpenses";
import { PendingSettlements } from "./PendingSettlements";
import { GroupsList } from "./GroupsList";
import { MonthlyTrend } from "./MonthlyTrend";

export type { WidgetDefinition, WidgetProps, WidgetConfigField } from "./types";

interface RegistryEntry {
  component: React.MemoExoticType<React.ComponentType<WidgetProps>>;
  definition: WidgetDefinition;
}

export const WIDGET_REGISTRY: Record<string, RegistryEntry> = {
  "net-balance": {
    component: React.memo(NetBalance),
    definition: {
      type: "net-balance",
      name: "Net Balance",
      description: "Total owed to you, you owe, and net balance",
      defaultSize: { w: 3, h: 1 },
      allowedSizes: [
        { w: 1, h: 1 },
        { w: 2, h: 1 },
        { w: 3, h: 1 },
      ],
    },
  },
  "spending-by-group": {
    component: React.memo(SpendingByGroup),
    definition: {
      type: "spending-by-group",
      name: "Spending by Group",
      description: "Bar chart of total spending per group",
      defaultSize: { w: 2, h: 2 },
      allowedSizes: [
        { w: 1, h: 2 },
        { w: 2, h: 2 },
        { w: 3, h: 2 },
      ],
      configurable: [
        {
          key: "chartType",
          label: "Chart orientation",
          type: "select",
          options: [
            { value: "bar", label: "Vertical" },
            { value: "horizontal", label: "Horizontal" },
          ],
          default: "bar",
        },
      ],
    },
  },
  "spending-pie": {
    component: React.memo(SpendingPie),
    definition: {
      type: "spending-pie",
      name: "Spending Pie",
      description: "Pie or donut chart of spending distribution",
      defaultSize: { w: 1, h: 2 },
      allowedSizes: [
        { w: 1, h: 2 },
        { w: 2, h: 2 },
      ],
      configurable: [
        {
          key: "chartType",
          label: "Chart style",
          type: "select",
          options: [
            { value: "pie", label: "Pie" },
            { value: "donut", label: "Donut" },
          ],
          default: "pie",
        },
      ],
    },
  },
  "top-debtor": {
    component: React.memo(TopDebtor),
    definition: {
      type: "top-debtor",
      name: "Top Debtor",
      description: "Person who owes you the most",
      defaultSize: { w: 1, h: 1 },
      allowedSizes: [{ w: 1, h: 1 }],
    },
  },
  "you-owe-most": {
    component: React.memo(YouOweMost),
    definition: {
      type: "you-owe-most",
      name: "You Owe Most",
      description: "Group where you owe the most",
      defaultSize: { w: 1, h: 1 },
      allowedSizes: [{ w: 1, h: 1 }],
    },
  },
  "recent-expenses": {
    component: React.memo(RecentExpenses),
    definition: {
      type: "recent-expenses",
      name: "Recent Expenses",
      description: "Latest expenses across all your groups",
      defaultSize: { w: 2, h: 2 },
      allowedSizes: [
        { w: 1, h: 2 },
        { w: 2, h: 2 },
        { w: 3, h: 2 },
      ],
      configurable: [
        {
          key: "count",
          label: "Number of expenses",
          type: "select",
          options: [
            { value: "5", label: "5" },
            { value: "10", label: "10" },
            { value: "20", label: "20" },
          ],
          default: "10",
        },
      ],
    },
  },
  "pending-settlements": {
    component: React.memo(PendingSettlements),
    definition: {
      type: "pending-settlements",
      name: "Pending Settlements",
      description: "Outstanding settlements awaiting confirmation",
      defaultSize: { w: 2, h: 1 },
      allowedSizes: [
        { w: 1, h: 1 },
        { w: 2, h: 1 },
        { w: 2, h: 2 },
        { w: 3, h: 1 },
      ],
    },
  },
  "groups-list": {
    component: React.memo(GroupsList),
    definition: {
      type: "groups-list",
      name: "Groups",
      description: "Your groups with balance indicators",
      defaultSize: { w: 1, h: 2 },
      allowedSizes: [
        { w: 1, h: 1 },
        { w: 1, h: 2 },
        { w: 2, h: 2 },
      ],
    },
  },
  "monthly-trend": {
    component: React.memo(MonthlyTrend),
    definition: {
      type: "monthly-trend",
      name: "Monthly Trend",
      description: "Your spending trend over time",
      defaultSize: { w: 2, h: 1 },
      allowedSizes: [
        { w: 2, h: 1 },
        { w: 2, h: 2 },
        { w: 3, h: 1 },
        { w: 3, h: 2 },
      ],
      configurable: [
        {
          key: "period",
          label: "Period",
          type: "select",
          options: [
            { value: "3", label: "3 months" },
            { value: "6", label: "6 months" },
            { value: "12", label: "12 months" },
          ],
          default: "12",
        },
        {
          key: "chartType",
          label: "Chart style",
          type: "select",
          options: [
            { value: "line", label: "Line" },
            { value: "area", label: "Area" },
          ],
          default: "line",
        },
      ],
    },
  },
};
