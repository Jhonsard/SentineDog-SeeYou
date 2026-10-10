import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User } from "lucide-react";
import { toast } from "sonner";
import { API_ENDPOINTS } from "@/config";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Encodage strict au format de formulaire requis par OAuth2 / Pydantic
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
      const response = await fetch(API_ENDPOINTS.AUTH.TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });

      const data = await response.json();

      if (response.ok && data.access_token) {
        login(data.access_token);
        toast.success("Authentification réussie. Session opérateur ouverte.");
      } else {
        toast.error(data.detail || "Identifiants d'administration non valides.");
      }
    } catch (error) {
      toast.error("Échec de connexion avec le serveur d'authentification.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-border bg-card/60 backdrop-blur shadow-2xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-black">
            <img src="/Seeyou.webp" alt="SeeYou" className="h-full w-full object-cover" />
          </div>
          <CardTitle className="text-2xl font-mono tracking-tight">Console de Contrôle IDS/IPS</CardTitle>
          <CardDescription>Entrez vos privilèges pour déverrouiller l'actionneur du pare-feu.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1 relative">
              <User className="absolute left-3 top-9 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Nom d'utilisateur"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 font-mono text-sm"
                required
              />
            </div>
            <div className="space-y-1 relative">
              <Lock className="absolute left-3 top-9 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 font-mono text-sm"
                required
              />
            </div>
            <Button type="submit" className="w-full font-sans tracking-wide" disabled={isLoading}>
              {isLoading ? "Vérification..." : "Ouvrir la session"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
