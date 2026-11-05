import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { API_ENDPOINTS } from "@/config";

interface ResetPasswordFormProps extends React.ComponentProps<"form"> {
  token: string;
  onSuccess: () => void;
  onBackToLogin: () => void;
}

export function ResetPasswordForm({
  className,
  token,
  onSuccess,
  onBackToLogin,
  ...props
}: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setServerError(null);

    if (password.length < 8) {
      setError("Au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        toast.success("Mot de passe modifié. Vous pouvez vous connecter.");
        onSuccess();
      } else {
        setServerError(
          data.detail ||
            "Lien invalide ou expiré. Demandez un nouveau lien de réinitialisation.",
        );
      }
    } catch {
      setServerError("Impossible de joindre le serveur d'authentification.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Lien invalide
        </h1>
        <FieldError>
          Ce lien de réinitialisation est incomplet ou expiré.
        </FieldError>
        <Button type="button" onClick={onBackToLogin}>
          Revenir à la connexion
        </Button>
      </div>
    );
  }

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
            Nouveau mot de passe
          </h1>
          <p className="text-sm text-balance text-muted-foreground">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="reset-password">Nouveau mot de passe</FieldLabel>
          <PasswordInput
            id="reset-password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={!!error}
            required
          />
          <FieldDescription>Au moins 8 caractères.</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="reset-confirm-password">
            Confirmer le mot de passe
          </FieldLabel>
          <PasswordInput
            id="reset-confirm-password"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            aria-invalid={!!error}
            required
          />
        </Field>

        {error && <FieldError>{error}</FieldError>}
        {serverError && <FieldError>{serverError}</FieldError>}

        <Field>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Modification..." : "Modifier le mot de passe"}
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
