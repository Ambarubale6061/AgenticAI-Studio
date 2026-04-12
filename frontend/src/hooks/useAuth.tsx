import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (fullName: string) => Promise<{ error: string | null }>;
  updateAvatar: (avatarFile: File) => Promise<{ error: string | null }>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (
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

    if (msg.includes("already registered") || msg.includes("already been registered")) {
      return { error: "An account with this email already exists. Please sign in instead." };
    }

    // Surface the real error — do NOT swallow SMTP / 500 errors.
    // If email delivery is broken you need the actual message to diagnose it.
    return { error: signUpError.message };
  }

  // Supabase returns a user but with an unconfirmed email.
  // Guard against the edge case where email confirmations are disabled
  // (Supabase auto-confirms and returns a full session immediately).
  if (data.session) {
    // Confirmations are OFF in the dashboard — sign them out so the
    // intended signup → confirm → login flow is still enforced.
    await supabase.auth.signOut();
    console.warn(
      "Supabase returned a session immediately after signUp — " +
      "this means 'Enable email confirmations' is OFF in your dashboard. " +
      "Turn it on: Authentication → Email → Enable email confirmations."
    );
  }

  // Queue avatar upload for after email confirmation (existing logic is correct)
  if (avatarFile && data.user) {
    try {
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sessionStorage.setItem("pending_avatar_data_url", reader.result as string);
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
}, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(async (fullName: string) => {
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });
    if (!error && data.user) setUser(data.user);
    return { error: error?.message ?? null };
  }, []);

  const updateAvatar = useCallback(async (avatarFile: File) => {
    if (!user) return { error: "No user" };
    try {
      const avatarUrl = await uploadAvatar(user.id, avatarFile);
      const { data, error } = await supabase.auth.updateUser({
        data: { ...user.user_metadata, avatar_url: avatarUrl },
      });
      if (error) return { error: error.message };
      setUser(data.user);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Upload failed" };
    }
  }, [user]);

  const updatePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!user?.email) return { error: "No user email" };
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) return { error: "Current password is incorrect" };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      signUp, signIn, signOut,
      updateProfile, updateAvatar, updatePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}