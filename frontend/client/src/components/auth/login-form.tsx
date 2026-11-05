import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "@/config";
import { GithubMark } from "./github-mark";

interface LoginFormProps extends React.ComponentProps<"form"> {
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
}

export function LoginForm({
  className,
  onSwitchToSignup,
  onForgotPassword,
  ...props
}: LoginFormProps) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    // L'API de token est en OAuth2 : le champ attendu s'appelle `username`.
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
      const response = await fetch(API_ENDPOINTS.AUTH.TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.access_token) {
        login(data.access_token);
        toast.success("Connexion réussie. Session opérateur ouverte.");
      } else {
        const message = data.detail || "Identifiant ou mot de passe invalide.";
        setError(message);
        toast.error(message);
      }
    } catch {
      const message = "Impossible de joindre le serveur d'authentification.";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Connexion à votre compte
          </h1>
          <p className="text-sm text-balance text-muted-foreground">
            Saisissez vos identifiants pour accéder à la console.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="login-username">
            Identifiant ou e-mail
          </FieldLabel>
          <Input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="operateur ou m@exemple.com"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </Field>

        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="login-password">Mot de passe</FieldLabel>
            <button
              type="button"
              onClick={onForgotPassword}
              className="ml-auto text-sm text-foreground underline underline-offset-4"
            >
              Mot de passe oublié ?
            </button>
          </div>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        {error && <FieldError>{error}</FieldError>}

        <Field>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Connexion..." : "Se connecter"}
          </Button>
        </Field>

        <FieldSeparator className="[&_[data-slot=field-separator-content]]:bg-card">
          Ou continuer avec
        </FieldSeparator>

        <Field>
          <Button
            variant="outline"
            type="button"
            className="w-full"
            disabled
            title="Bientôt disponible"
            aria-describedby="login-github-note"
          >
            <GithubMark className="size-4" />
            Se connecter avec GitHub
          </Button>
          <FieldDescription
            id="login-github-note"
            className="text-center text-xs"
          >
            La connexion GitHub sera disponible prochainement.
          </FieldDescription>
          <FieldDescription className="text-center">
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={onSwitchToSignup}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Créer un compte
            </button>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
