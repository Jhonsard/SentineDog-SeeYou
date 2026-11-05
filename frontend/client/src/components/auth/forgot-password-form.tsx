import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { API_ENDPOINTS } from "@/config";

interface ForgotPasswordFormProps extends React.ComponentProps<"form"> {
  onBackToLogin: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordForm({
  className,
  onBackToLogin,
  ...props
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setDevResetUrl(null);

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Format d'e-mail invalide.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setMessage(
          data.message ||
            "Si un compte existe avec cet e-mail, un lien de réinitialisation vient d'être envoyé.",
        );
        // En développement uniquement, le backend renvoie le lien pour tester sans SMTP.
        if (typeof data.reset_url === "string") {
          setDevResetUrl(data.reset_url);
        }
      } else {
        setError(data.detail || "Impossible d'envoyer la demande.");
      }
    } catch {
      setError("Impossible de joindre le serveur d'authentification.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      noValidate
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Mot de passe oublié
          </h1>
          <p className="text-sm text-balance text-muted-foreground">
            Saisissez l'e-mail associé à votre compte. Un lien de
            réinitialisation vous sera envoyé.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="forgot-email">E-mail</FieldLabel>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="m@exemple.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={!!error}
            required
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>

        {message && (
          <div
            role="status"
            className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground"
          >
            <p>{message}</p>
            {devResetUrl && (
              <p className="mt-2 break-all text-xs text-muted-foreground">
                Mode développement :{" "}
                <a
                  href={devResetUrl}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  ouvrir le lien de réinitialisation
                </a>
              </p>
            )}
          </div>
        )}

        <Field>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Envoi..." : "Envoyer le lien"}
          </Button>
          <FieldDescription className="text-center">
            <button
              type="button"
              onClick={onBackToLogin}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Retour à la connexion
            </button>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
