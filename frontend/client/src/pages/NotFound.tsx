import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <Card className="mx-4 w-full max-w-lg border-border bg-card">
        <CardContent className="pb-8 pt-8 text-center">
          <div className="mb-6 flex justify-center">
            <AlertCircle
              className="h-16 w-16 text-foreground"
              aria-hidden="true"
            />
          </div>

          <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>

          <h2 className="mb-4 text-xl font-semibold text-foreground">
            Page introuvable
          </h2>

          <p className="mb-8 leading-relaxed text-muted-foreground">
            Désolé, la page demandée n'existe pas.
            <br />
            Elle a peut-être été déplacée ou supprimée.
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={handleGoHome} className="gap-2 px-6 py-2.5">
              <Home className="h-4 w-4" aria-hidden="true" />
              Retour à l'accueil
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
