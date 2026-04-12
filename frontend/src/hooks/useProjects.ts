// src/hooks/useProjects.ts
// All project and message data is stored in Supabase and queried directly
// from the frontend. No backend/Express involvement for data operations.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string;
  language: string;
  status: string;
  plan: any[];
  generated_code: any[];
  console_output: any[];
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
  created_at: string;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["projects", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data as Project[];
    },
  });
}

export function useProject(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["project", id],
    enabled: !!user && !!id && id !== "new" && id !== "demo",
    queryFn: async () => {
      if (!id || id === "new" || id === "demo") throw new Error("Invalid project ID");
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .eq("user_id", user!.id)
        .single();
      if (error) throw new Error(error.message);
      return data as Project;
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { title?: string; description?: string }) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          user_id: user!.id,
          title: input.title || "Untitled Project",
          description: input.description || "",
          status: "idle",
          plan: [],
          generated_code: [],
          console_output: [],
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Project;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Project> & { id: string }) => {
      if (!id || id === "new" || id === "demo") throw new Error("Invalid project ID");
      const { data, error } = await supabase
        .from("projects")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user!.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Project;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", vars.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!id || id === "new" || id === "demo") throw new Error("Invalid project ID");
      // Delete messages first (cascade not guaranteed on all setups)
      await supabase.from("messages").delete().eq("project_id", id);
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function useProjectMessages(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["messages", projectId],
    enabled: !!user && !!projectId && projectId !== "new" && projectId !== "demo",
    queryFn: async () => {
      if (!projectId || projectId === "new" || projectId === "demo") {
        throw new Error("Invalid project ID");
      }
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data as Message[];
    },
  });
}

export function useSaveMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (msg: {
      project_id: string;
      role: string;
      agent?: string;
      content: string;
    }) => {
      if (!msg.project_id || msg.project_id === "new" || msg.project_id === "demo") {
        throw new Error("Invalid project ID");
      }
      const { data, error } = await supabase
        .from("messages")
        .insert({ ...msg, user_id: user!.id })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data as Message;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["messages", vars.project_id] });
    },
  });
}