// src/lib/backendStorage.ts
// Avatar uploads now go to the Express backend, which stores the URL
// in MongoDB (User model). No Supabase Storage is used.

import { supabase } from "@/integrations/supabase/client";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Uploads an avatar image for the current user via the backend.
 * @param file   The image File to upload.
 * @returns      The public URL of the stored avatar.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Not authenticated");
  }

  const formData = new FormData();
  formData.append("avatar", file);

  const res = await fetch(`${API_BASE}/api/users/avatar`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      // Do NOT set Content-Type here — browser sets it automatically
      // with the correct multipart boundary when using FormData.
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error(err.error || "Avatar upload failed");
  }

  const result = await res.json();
  return result.avatar_url as string;
}
