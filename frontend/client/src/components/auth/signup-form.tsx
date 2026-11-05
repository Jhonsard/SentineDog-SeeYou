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
import { API_ENDPOINTS } from "@/config";
import { GithubMark } from "./github-mark";

type SignupField =
  | "fullName"
  | "username"
  | "email"
  | "password"
  | "confirmPassword";

type SignupErrors = Partial<Record<SignupField, string>>;

interface SignupFormProps extends React.ComponentProps<"form"> {
  onSwitchToLogin: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm({
  className,
  onSwitchToLogin,
  ...props
}: SignupFormProps) {
  const [values, setValues] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<SignupErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateField = (field: SignupField, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: SignupErrors = {};

    if (!values.fullName.trim()) {
      next.fullName = "Le nom complet est requis.";
    }
    if (!values.username.trim()) {
      next.username = "Le nom d'utilisateur est requis.";
    } else if (values.username.trim().length < 3) {
      next.username = "Au moins 3 caractères.";
    }
    if (!values.email.trim()) {
      next.email = "L'e-mail est requis.";
    } else if (!EMAIL_PATTERN.test(values.email.trim())) {
      next.email = "Format d'e-mail invalide.";
    }
    if (!values.password) {
      next.password = "Le mot de passe est requis.";
    } else if (values.password.length < 8) {
      next.password = "Au moins 8 caractères.";
    }
    if (!values.confirmPassword) {
      next.confirmPassword = "Confirmez le mot de passe.";
    } else if (values.password !== values.confirmPassword) {
      next.confirmPassword = "Les mots de passe ne correspondent pas.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.AUTH.REGISTER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: values.username.trim(),
          full_name: values.fullName.trim(),
          email: values.email.trim(),
          password: values.password,
          role: "user",
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        toast.success("Compte créé. Vous pouvez maintenant vous connecter.");
        setValues({
          fullName: "",
          username: "",
          email: "",
          password: "",
          confirmPassword: "",
        });
        setErrors({});
        onSwitchToLogin();
      } else {
        const message = data.detail || "Impossible de créer le compte.";
        setServerError(
          typeof message === "string"
            ? message
            : "Impossible de créer le compte.",
        );
        toast.error("Impossible de créer le compte.");
      }
    } catch {
      const message = "Impossible de joindre le serveur d'authentification.";
      setServerError(message);
      toast.error(message);
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
            Créer votre compte
          </h1>
          <p className="text-sm text-balance text-muted-foreground">
            Renseignez le formulaire pour ouvrir une session opérateur.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="signup-name">Nom complet</FieldLabel>
          <Input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="John Doe"
            value={values.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            aria-invalid={!!errors.fullName}
            required
          />
          {errors.fullName && <FieldError>{errors.fullName}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="signup-username">Nom d'utilisateur</FieldLabel>
          <Input
            id="signup-username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="john-doe"
            value={values.username}
            onChange={(event) => updateField("username", event.target.value)}
            aria-invalid={!!errors.username}
            required
          />
          {errors.username && <FieldError>{errors.username}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="signup-email">E-mail</FieldLabel>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="m@exemple.com"
            value={values.email}
            onChange={(event) => updateField("email", event.target.value)}
            aria-invalid={!!errors.email}
            required
          />
          <FieldDescription>
            Nous l'utiliserons pour vous contacter. Il ne sera partagé avec
            personne.
          </FieldDescription>
          {errors.email && <FieldError>{errors.email}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="signup-password">Mot de passe</FieldLabel>
          <PasswordInput
            id="signup-password"
            name="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => updateField("password", event.target.value)}
            aria-invalid={!!errors.password}
            required
          />
          <FieldDescription>Au moins 8 caractères.</FieldDescription>
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="signup-confirm-password">
            Confirmer le mot de passe
          </FieldLabel>
          <PasswordInput
            id="signup-confirm-password"
            name="confirmPassword"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(event) =>
              updateField("confirmPassword", event.target.value)
            }
            aria-invalid={!!errors.confirmPassword}
            required
          />
          {errors.confirmPassword && (
            <FieldError>{errors.confirmPassword}</FieldError>
          )}
        </Field>

        {serverError && <FieldError>{serverError}</FieldError>}

        <Field>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Création..." : "Créer le compte"}
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
            aria-describedby="signup-github-note"
          >
            <GithubMark className="size-4" />
            S'inscrire avec GitHub
          </Button>
          <FieldDescription
            id="signup-github-note"
            className="text-center text-xs"
          >
            L'inscription GitHub sera disponible prochainement.
          </FieldDescription>
          <FieldDescription className="text-center">
            Déjà un compte ?{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Se connecter
            </button>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
