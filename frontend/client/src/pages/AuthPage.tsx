import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

type AuthMode = "login" | "signup" | "forgot";

/**
 * Page d'authentification à deux colonnes : formulaire à gauche,
 * illustration à droite. La bascule connexion / inscription se fait
 * en mémoire, sans rechargement ni changement d'URL.
 */
export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [location, setLocation] = useLocation();
  const isReset = location.startsWith("/reset-password");
  const resetToken = isReset
    ? (new URLSearchParams(window.location.search).get("token") ?? "")
    : "";

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4 font-ui sm:p-6">
      <Card className="w-full max-w-4xl gap-0 overflow-hidden border-border bg-card p-0 shadow-none">
        <CardContent className="p-0">
          <div className="grid md:grid-cols-2">
            {/* Colonne formulaire */}
            <div className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-10">
              <div className="mb-8 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
                  <img
                    src="/Seeyou.webp"
                    alt="SeeYou"
                    className="h-full w-full object-cover"
                  />
                </span>
                <div>
                  <p className="text-lg font-semibold tracking-tight text-foreground">
                    SeeYou
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Console de sécurité · ULPGL Goma
                  </p>
                </div>
              </div>

              <div
                key={isReset ? "reset" : mode}
                className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
              >
                {isReset ? (
                  <ResetPasswordForm
                    token={resetToken}
                    onSuccess={() => setLocation("/login")}
                    onBackToLogin={() => setLocation("/login")}
                  />
                ) : mode === "login" ? (
                  <LoginForm
                    onSwitchToSignup={() => setMode("signup")}
                    onForgotPassword={() => setMode("forgot")}
                  />
                ) : mode === "signup" ? (
                  <SignupForm onSwitchToLogin={() => setMode("login")} />
                ) : (
                  <ForgotPasswordForm onBackToLogin={() => setMode("login")} />
                )}
              </div>
            </div>

            {/* Colonne illustration */}
            <div className="relative hidden bg-muted md:block">
              <img
                src="/hero-banner.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
