/**
 * AuthCallback.tsx
 *
 * Supabase redirects the user here after they click the confirmation link in
 * their email. The URL contains either:
 *   - A `code` query param  (PKCE flow — Supabase default for new projects)
 *   - A `#access_token` hash (implicit flow — older projects)
 *
 * The Supabase client processes the URL automatically via detectSessionInUrl.
 * We listen for the resulting SIGNED_IN / USER_UPDATED event, then immediately
 * sign the user out so they must log in manually, fulfilling the strict
 * "signup → email confirm → login" requirement.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { uploadAvatar } from "@/lib/supabaseStorage";

type Status = "verifying" | "success" | "error";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout>;

    const handleCallback = async () => {
      // ── 1. Exchange the code / hash for a session ────────────────────────
      // For PKCE flow Supabase requires an explicit exchange.
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus("error");
          setMessage("The confirmation link is invalid or has expired. Please sign up again.");
          return;
        }
      }

      // ── 2. Wait for the live session (covers both PKCE and implicit flow) ─
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setStatus("error");
        setMessage("Could not verify your email. The link may have expired. Please sign up again.");
        return;
      }

      // ── 3. Upload any pending avatar that was queued during signup ────────
      try {
        const pendingDataUrl  = sessionStorage.getItem("pending_avatar_data_url");
        const pendingUserId   = sessionStorage.getItem("pending_avatar_user_id");
        const pendingFullName = sessionStorage.getItem("pending_avatar_full_name");

        if (pendingDataUrl && pendingUserId && pendingUserId === session.user.id) {
          // Convert data-URL → File
          const res  = await fetch(pendingDataUrl);
          const blob = await res.blob();
          const file = new File([blob], "avatar.jpg", { type: blob.type });

          const avatarUrl = await uploadAvatar(session.user.id, file);
          await supabase.auth.updateUser({
            data: {
              full_name: pendingFullName ?? session.user.user_metadata?.full_name,
              avatar_url: avatarUrl,
            },
          });
        }
      } catch (err) {
        // Avatar upload failure is non-fatal — user is still confirmed
        console.error("Pending avatar upload failed:", err);
      } finally {
        sessionStorage.removeItem("pending_avatar_data_url");
        sessionStorage.removeItem("pending_avatar_user_id");
        sessionStorage.removeItem("pending_avatar_full_name");
      }

      // ── 4. Sign the user out ──────────────────────────────────────────────
      // Email is now confirmed in Supabase's database. We sign out here so
      // the user must go through the login page — enforcing the strict flow.
      await supabase.auth.signOut();

      setStatus("success");
      setMessage("Email confirmed! Redirecting to sign in…");

      // ── 5. Redirect to login with a flag so the Login page can show a banner
      redirectTimer = setTimeout(() => {
        navigate("/login?confirmed=true", { replace: true });
      }, 2000);
    };

    handleCallback();

    return () => clearTimeout(redirectTimer);
  }, [navigate]);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        {status === "verifying" && (
          <>
            <div className="flex justify-center">
              <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-muted-foreground text-sm">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex justify-center">
              {/* Simple animated checkmark — no extra dependency */}
              <svg
                className="h-14 w-14 text-primary"
                viewBox="0 0 52 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="26" cy="26" r="25" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M14 26l8 8 16-16"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Email verified!</h2>
            <p className="text-muted-foreground text-sm">{message}</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex justify-center">
              <svg
                className="h-14 w-14 text-destructive"
                viewBox="0 0 52 52"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="26" cy="26" r="25" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M18 18l16 16M34 18L18 34"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Verification failed</h2>
            <p className="text-muted-foreground text-sm">{message}</p>
            <a href="/signup" className="text-primary text-sm hover:underline">
              Back to sign up
            </a>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;