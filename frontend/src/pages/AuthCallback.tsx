/**
 * AuthCallback.tsx
 *
 * Supabase redirects here after the user clicks the email confirmation link.
 * The URL contains either:
 *   - ?code=...  (PKCE flow — default for new Supabase projects)
 *   - #access_token=... (implicit flow — older projects)
 *
 * After confirming the session we:
 *   1. Upload any pending avatar to the backend (not Supabase Storage)
 *   2. Persist the avatar_url in Supabase user_metadata
 *   3. Sign the user out so they must log in manually
 *   4. Redirect to /login?confirmed=true
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
      // ── 1. Exchange PKCE code for a session ───────────────────────────────
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setStatus("error");
          setMessage(
            "The confirmation link is invalid or has expired. Please sign up again."
          );
          return;
        }
      }

      // ── 2. Confirm a live session exists ──────────────────────────────────
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStatus("error");
        setMessage(
          "Could not verify your email. The link may have expired. Please sign up again."
        );
        return;
      }

      // ── 3. Upload pending avatar via backend ──────────────────────────────
      // The avatar File was serialised to a data-URL during signup and stored
      // in sessionStorage so it survives the email confirmation redirect.
      try {
        const pendingDataUrl = sessionStorage.getItem("pending_avatar_data_url");
        const pendingUserId = sessionStorage.getItem("pending_avatar_user_id");
        const pendingFullName = sessionStorage.getItem("pending_avatar_full_name");

        if (
          pendingDataUrl &&
          pendingUserId &&
          pendingUserId === session.user.id
        ) {
          // Convert data-URL → File
          const res = await fetch(pendingDataUrl);
          const blob = await res.blob();
          const file = new File([blob], "avatar.jpg", { type: blob.type });

          // Upload to backend (returns public URL)
          const avatarUrl = await uploadAvatar(file);

          // Persist in Supabase user_metadata so the avatar is available
          // from the session everywhere without an extra backend call.
          await supabase.auth.updateUser({
            data: {
              full_name:
                pendingFullName ?? session.user.user_metadata?.full_name,
              avatar_url: avatarUrl,
            },
          });
        }
      } catch (err) {
        // Non-fatal — the user is still confirmed even if avatar upload fails.
        console.error("Pending avatar upload failed:", err);
      } finally {
        sessionStorage.removeItem("pending_avatar_data_url");
        sessionStorage.removeItem("pending_avatar_user_id");
        sessionStorage.removeItem("pending_avatar_full_name");
      }

      // ── 4. Sign the user out ──────────────────────────────────────────────
      // Email is now confirmed. We force them through the login page.
      await supabase.auth.signOut();

      setStatus("success");
      setMessage("Email confirmed! Redirecting to sign in…");

      // ── 5. Redirect to login with confirmed flag ───────────────────────────
      redirectTimer = setTimeout(() => {
        navigate("/login?confirmed=true", { replace: true });
      }, 2000);
    };

    handleCallback();
    return () => clearTimeout(redirectTimer);
  }, [navigate]);

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
