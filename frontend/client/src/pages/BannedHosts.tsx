import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { API_ENDPOINTS } from "@/config";

interface BannedHost {
  id: number;
  source_ip: string;
  alert_type: string;
  timestamp_block: string;
  reason?: string;
}

export default function BannedHosts() {
  const { token } = useAuth();
  const [bannedHosts, setBannedHosts] = useState<BannedHost[]>([]);
  const [loading, setLoading] = useState(true);

  // Charger la liste des hôtes bloqués depuis l'API
  const fetchBannedHosts = async () => {
    if (!token) {
      toast.error("Session admin manquante. Veuillez vous reconnecter.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.ALERTS.BANNED_HOSTS, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        const data = await response.json();
        setBannedHosts(data);
      } else if (response.status === 401) {
        toast.error("Votre session a expiré (401 Unauthorized).");
      } else {
        toast.error("Erreur lors de la récupération des données du pare-feu.");
      }
    } catch (error) {
      toast.error("Impossible de joindre le contrôleur de filtrage.");
    } finally {
      setLoading(false);
    }
  };

  // Actionneur IPS : Supprimer la règle de bannissement
  const handleUnban = async (hostIp: string, alertId: number) => {
    try {
      const response = await fetch(`${API_ENDPOINTS.ALERTS.UNBAN(alertId)}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ ip: hostIp })
      });

      if (response.ok) {
        toast.success(`Hôte réintégré : ${hostIp} a été retiré des règles iptables.`);
        // Mise à jour de l'interface locale
        setBannedHosts(prev => prev.filter(host => host.source_ip !== hostIp));
      } else {
        toast.error("Erreur lors de la réintégration au niveau du Kernel OS.");
      }
    } catch (error) {
      toast.error("Le contrôleur de filtrage a rejeté la requête de débannissement.");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 font-sans-serif">
      <Card className="border-zinc-800/80 bg-zinc-950/40 backdrop-blur-md shadow-2xl">
        <CardHeader className="border-b border-zinc-900 pb-4">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            Règles d'Isolement Actives (Blacklist Noyau)
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs mt-1">
            Hôtes actuellement bannis du réseau de l'ULPGL. Les paquets entrants en provenance de ces adresses sont automatiquement rejetés (DROP).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-900/50 text-[11px] uppercase">
                <TableRow className="border-zinc-900">
                  <TableHead className="text-zinc-500 pl-4">IP Source Isolée</TableHead>
                  <TableHead className="text-zinc-500">Motif d'interception</TableHead>
                  <TableHead className="text-zinc-500">Date d'isolement</TableHead>
                  <TableHead className="text-right text-zinc-500 pr-4">Action Réintégration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bannedHosts.length === 0 ? (
                  <TableRow className="border-zinc-900">
                    <TableCell colSpan={4} className="h-32 text-center text-zinc-600 text-xs italic">
                      Aucune adresse IP n'est actuellement isolée par le pare-feu.
                    </TableCell>
                  </TableRow>
                ) : (
                  bannedHosts.map((host) => (
                    <TableRow key={host.id} className="border-zinc-900/40 text-xs text-zinc-300">
                      <TableCell className="text-red-400 font-bold pl-4">{host.source_ip}</TableCell>
                      <TableCell className="font-sans text-zinc-400">{host.alert_type}</TableCell>
                      <TableCell>{new Date(host.timestamp_block).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600 hover:text-white font-sans font-bold uppercase transition-all"
                          onClick={() => handleUnban(host.source_ip, host.id)}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1.5" /> Réintégrer l'hôte
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
