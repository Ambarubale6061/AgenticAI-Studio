// src/hooks/useAuth.tsx
// Supabase is used ONLY for authentication (signUp, signIn, signOut,
// password change, email confirmation).
// Avatar uploads go to the Express backend via backendStorage.ts.
// Profile data (full_name, avatar_url) is stored in Supabase user_metadata
// so it survives without any extra DB call — keeping the auth layer self-contained.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { uploadAvatar } from "@/lib/supabaseStorage";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    avatarFile?: File
  ) => Promise<{ error: string | null }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<{ error: string | null }>;
  updateAvatar: (avatarFile: File) => Promise<{ error: string | null }>;
  updatePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Hydrate on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Sign Up ────────────────────────────────────────────────────────────────
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
      avatarFile?: File
    ): Promise<{ error: string | null }> => {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        if (
          msg.includes("already registered") ||
          msg.includes("already been registered")
        ) {
          return {
            error:
              "An account with this email already exists. Please sign in instead.",
          };
        }
        return { error: signUpError.message };
      }

      // Guard: if email confirmations are OFF, Supabase returns a session
      // immediately. Sign out to enforce the confirm → login flow.
      if (data.session) {
        await supabase.auth.signOut();
        console.warn(
          "Supabase returned a session immediately after signUp — " +
            "'Enable email confirmations' appears to be OFF in your dashboard."
        );
      }

      // Store avatar in sessionStorage so AuthCallback can upload it
      // after the user clicks the confirmation link.
      if (avatarFile && data.user) {
        try {
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              sessionStorage.setItem(
                "pending_avatar_data_url",
                reader.result as string
              );
              sessionStorage.setItem("pending_avatar_user_id", data.user!.id);
              sessionStorage.setItem("pending_avatar_full_name", fullName);
              resolve();
            };
            reader.readAsDataURL(avatarFile);
          });
        } catch (err) {
          console.error("Could not store pending avatar:", err);
        }
      }

      return { error: null };
    },
    []
  );

  // ─── Sign In ────────────────────────────────────────────────────────────────
  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("email not confirmed") || msg.includes("confirm")) {
          return {
            error:
              "Please confirm your email address before signing in. " +
              "Check your inbox for the confirmation link.",
          };
        }
        return { error: error.message };
      }
      return { error: null };
    },
    []
  );

  // ─── Sign Out ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ─── Update Display Name ────────────────────────────────────────────────────
  const updateProfile = useCallback(
    async (fullName: string): Promise<{ error: string | null }> => {
      const { data, error } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      });
      if (!error && data.user) setUser(data.user);
      return { error: error?.message ?? null };
    },
    []
  );

  // ─── Update Avatar ──────────────────────────────────────────────────────────
  // Uploads to backend → gets URL back → stores it in Supabase user_metadata.
  const updateAvatar = useCallback(
    async (avatarFile: File): Promise<{ error: string | null }> => {
      if (!user) return { error: "No user" };
      try {
        const avatarUrl = await uploadAvatar(avatarFile);

        // Persist the URL in Supabase user_metadata so it's always available
        // from the session without an extra DB round-trip.
        const { data, error } = await supabase.auth.updateUser({
          data: { ...user.user_metadata, avatar_url: avatarUrl },
        });
        if (error) return { error: error.message };
        setUser(data.user);
        return { error: null };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "Upload failed",
        };
      }
    },
    [user]
  );

  // ─── Update Password ────────────────────────────────────────────────────────
  const updatePassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string
    ): Promise<{ error: string | null }> => {
      if (!user?.email) return { error: "No user email" };

      // Re-authenticate first to confirm the current password is correct.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) return { error: "Current password is incorrect" };

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      return { error: error?.message ?? null };
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfile,
        updateAvatar,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
