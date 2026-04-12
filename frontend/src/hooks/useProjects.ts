// src/hooks/useProjects.ts
// ALL data operations now go through the Express/MongoDB backend.
// Supabase is used ONLY for auth — getSession() here is just to get
// the JWT access token that the backend's authMiddleware validates.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

// ─── Shared fetch helper ──────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");

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

  // 204 No Content — nothing to parse
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string;
  language: string;
  status: string;
  plan: unknown[];
  generated_code: unknown[];
  console_output: unknown[];
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  agent?: string;
  content: string;
  createdAt: string; // Mongoose timestamps use camelCase
}

// ─── PROJECTS ─────────────────────────────────────────────────────────────────

export function useProjects() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["projects", user?.id],
    enabled: !!user?.id,
    queryFn: () => apiFetch<Project[]>("/api/projects"),
  });
}

export function useProject(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["project", id],
    enabled: !!user?.id && !!id && id !== "new" && id !== "demo",
    queryFn: () => apiFetch<Project>(`/api/projects/${id}`),
  });
}

// ─── CREATE PROJECT ───────────────────────────────────────────────────────────

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (input: { title?: string; description?: string }) =>
      apiFetch<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          title: input.title || "Untitled Project",
          description: input.description || "",
        }),
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.id] });
    },
  });
}

// ─── UPDATE PROJECT ───────────────────────────────────────────────────────────

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, ...updates }: Partial<Project> & { id: string }) =>
      apiFetch<Project>(`/api/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      }),

    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["project", vars.id] });
    },
  });
}

// ─── DELETE PROJECT ───────────────────────────────────────────────────────────

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/projects/${id}`, { method: "DELETE" }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", user?.id] });
    },
  });
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

export function useProjectMessages(projectId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messages", projectId],
    enabled:
      !!user?.id &&
      !!projectId &&
      projectId !== "new" &&
      projectId !== "demo",
    queryFn: () =>
      apiFetch<Message[]>(`/api/projects/${projectId}/messages`),
  });
}

// ─── SAVE MESSAGE ─────────────────────────────────────────────────────────────

export function useSaveMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (msg: {
      project_id: string;
      role: string;
      agent?: string;
      content: string;
    }) =>
      apiFetch<Message>("/api/projects/messages", {
        method: "POST",
        body: JSON.stringify(msg),
      }),

    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["messages", vars.project_id],
      });
    },
  });
}
