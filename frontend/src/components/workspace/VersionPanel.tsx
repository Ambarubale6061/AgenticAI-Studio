// src/components/workspace/VersionPanel.tsx
// Snapshots are now persisted on the backend (MongoDB).
// loadSnapshots / createSnapshot / deleteSnapshot are async.

import { useState, useEffect } from "react";
import { History, Save, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import PanelHeader from "./PanelHeader";
import type { CodeFile } from "./CodePanel";
import {
  loadSnapshots,
  createSnapshot,
  deleteSnapshot,
  formatSnapshotTime,
  type CodeSnapshot,
} from "@/lib/versionControl";
import { toast } from "sonner";

interface VersionPanelProps {
  projectId: string;
  files: CodeFile[];
  onRestore: (files: CodeFile[]) => void;
}

const VersionPanel = ({ projectId, files, onRestore }: VersionPanelProps) => {
  const [snapshots, setSnapshots] = useState<CodeSnapshot[]>([]);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load snapshots from backend on mount / projectId change
  useEffect(() => {
    setLoading(true);
    loadSnapshots(projectId)
      .then(setSnapshots)
      .catch((err) => {
        console.error("[VersionPanel] Failed to load snapshots:", err);
        toast.error("Could not load version history");
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleSave = async () => {
    if (files.length === 0) return;
    setSaving(true);
    try {
      const snap = await createSnapshot(projectId, files, label.trim() || undefined);
      setSnapshots((prev) => [...prev, snap]);
      setLabel("");
      toast.success("Snapshot saved");
    } catch (err) {
      console.error("[VersionPanel] Save failed:", err);
      toast.error("Failed to save snapshot");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSnapshot(projectId, id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("[VersionPanel] Delete failed:", err);
      toast.error("Failed to delete snapshot");
    }
  };

  const handleRestore = (snap: CodeSnapshot) => {
    onRestore(snap.files);
  };

  return (
    <div className="flex flex-col h-full">
      <PanelHeader title="Versions" icon={History} iconColor="text-accent">
        <span className="text-[10px] text-muted-foreground">
          {snapshots.length} saved
        </span>
      </PanelHeader>

      {/* Save row */}
      <div className="p-2 border-b border-panel-border flex gap-1">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="h-7 text-xs bg-secondary border-panel-border flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          disabled={saving}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 text-[10px] text-primary hover:bg-primary/10"
          onClick={handleSave}
          disabled={files.length === 0 || saving}
        >
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Snapshot list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && (
            <p className="text-[11px] text-muted-foreground/50 text-center py-6 animate-pulse">
              Loading…
            </p>
          )}

          {!loading && snapshots.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 text-center py-6">
              No snapshots yet
            </p>
          )}

          {[...snapshots].reverse().map((snap) => (
            <div
              key={snap.id}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-secondary/50 transition-colors group"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">
                  {snap.label}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatSnapshotTime(snap.timestamp)} ·{" "}
                  {snap.files.length} file
                  {snap.files.length !== 1 ? "s" : ""}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleRestore(snap)}
                  title="Restore this version"
                >
                  <RotateCcw className="h-3 w-3 text-primary" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleDelete(snap.id)}
                  title="Delete snapshot"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default VersionPanel;
