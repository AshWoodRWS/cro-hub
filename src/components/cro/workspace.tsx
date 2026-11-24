import { createContext, useContext, useState, type ReactNode } from "react";
import type { TrackerRow } from "@/lib/tracker";
import { experiments } from "@/lib/cro-data";
const initialRows: TrackerRow[] = experiments.map((e) => ({
  sourceId: `${e.site}::${e.id}`,
  site: e.site,
  projectId: "",
  optimizelyId: e.id,
  title: e.title,
  launched: e.start,
  completed: e.end ?? "",
  outcome: e.outcome,
  implemented: e.implemented,
  significant: (e.significant ?? 0) >= 95,
  type: e.type,
  notes: e.notes,
}));
interface Workspace {
  rows: TrackerRow[];
  setRows: (rows: TrackerRow[]) => void;
  targets: Record<string, number>;
  setTargets: (targets: Record<string, number>) => void;
}
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState(initialRows);
  const [targets, setTargets] = useState<Record<string, number>>({});
  return (
    <Context.Provider value={{ rows, setRows, targets, setTargets }}>{children}</Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace missing");
  return context;
}
