// src/lib/versionControl.ts
// Version snapshots are now persisted to the backend (MongoDB).
// localStorage is still used as a fast local cache so the UI feels instant,
// but all reads/writes are authoritative on the server.

import { supabase } from "@/integrations/supabase/client";
import type { CodeFile } from "@/components/workspace/CodePanel";

export interface CodeSnapshot {
  id: string;
  label: string;
  timestamp: number;
  files: CodeFile[];
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

// ─── Auth helper ──────────────────────────────────────────────────────────────
async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Local cache key ──────────────────────────────────────────────────────────
function cacheKey(projectId: string): string {
  return `codeagent_snapshots_${projectId}`;
}

function readCache(projectId: string): CodeSnapshot[] {
  try {
    const raw = localStorage.getItem(cacheKey(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCache(projectId: string, snapshots: CodeSnapshot[]) {
  localStorage.setItem(cacheKey(projectId), JSON.stringify(snapshots));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load snapshots from the backend.
 * Falls back to local cache if the request fails (e.g. offline).
 */
export async function loadSnapshots(projectId: string): Promise<CodeSnapshot[]> {
  try {
    const raw = await apiFetch<
      Array<{ _id: string; id?: string; label: string; createdAt: string; files: CodeFile[] }>
    >(`/api/versions/${projectId}`);

    const snapshots: CodeSnapshot[] = raw.map((v) => ({
      id: v.id ?? v._id,
      label: v.label || "Untitled",
      timestamp: new Date(v.createdAt).getTime(),
      files: v.files,
    }));

    writeCache(projectId, snapshots);
    return snapshots;
  } catch (err) {
    console.warn("[versionControl] Falling back to local cache:", err);
    return readCache(projectId);
  }
}

/**
 * Create a new snapshot on the backend and update the local cache.
 */
export async function createSnapshot(
  projectId: string,
  files: CodeFile[],
  label?: string
): Promise<CodeSnapshot> {
  const cached = readCache(projectId);
  const version = cached.length + 1;
  const resolvedLabel = label || `v${version}`;

  const raw = await apiFetch<{
    _id: string;
    id?: string;
    label: string;
    createdAt: string;
    files: CodeFile[];
  }>(`/api/versions/${projectId}`, {
    method: "POST",
    body: JSON.stringify({ label: resolvedLabel, files }),
  });

  const snapshot: CodeSnapshot = {
    id: raw.id ?? raw._id,
    label: raw.label,
    timestamp: new Date(raw.createdAt).getTime(),
    files: raw.files,
  };

  writeCache(projectId, [...cached, snapshot]);
  return snapshot;
}

/**
 * Delete a snapshot on the backend and remove it from the local cache.
 */
export async function deleteSnapshot(
  projectId: string,
  snapshotId: string
): Promise<void> {
  await apiFetch(`/api/versions/${snapshotId}`, { method: "DELETE" });

  const updated = readCache(projectId).filter((s) => s.id !== snapshotId);
  writeCache(projectId, updated);
}

/** Format a Unix timestamp for display. */
export function formatSnapshotTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
