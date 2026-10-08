import React, { useEffect, useState } from 'react';
import { ShieldX, ShieldCheck, Search, Server } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { API_ENDPOINTS } from '../config';

interface BannedIP {
  ip: string;
  banned_at: string;
  reason: string;
  rule_index: string;
}

export default function BannedHosts() {
  const [bannedList, setBannedList] = useState<BannedIP[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchBanned = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.ALERTS.BANNED_HOSTS);
        if (res.ok) {
          const data = await res.json();
          setBannedList(data);
        } else {
          // Fallback static temporaire calqué sur les tests du réseau de l'ULPGL
          setBannedList([
            { ip: "192.168.43.210", banned_at: "14:22:05", reason: "Scans de ports verticaux répétés (Nmap)", rule_index: "IPSET_RUL_01" },
            { ip: "10.10.12.45", banned_at: "15:01:12", reason: "Tentative d'injection de paquets malformés (Scapy)", rule_index: "IPSET_RUL_02" }
          ]);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchBanned();
  }, []);

  const filtered = bannedList.filter(item => item.ip.includes(searchQuery));

  return (
    <div className="p-6 flex flex-col gap-6 font-mono">
      <div>
        <h2 className="text-sm font-bold text-[#ffb4ab] uppercase tracking-wider flex items-center gap-2">
          <ShieldX className="h-4 w-4" /> Registre des Hôtes Bloqués (Noyau Netfilter)
        </h2>
        <p className="text-[11px] text-[#8c909f] mt-1">
          Historique des adresses IP isolées et des règles de drop actives sur l'interface réseau.
        </p>
      </div>

      <div className="flex items-center gap-2 bg-[#0c0e12] border border-[#1d2027] rounded-sm px-3 py-1.5 max-w-md">
        <Search className="h-3.5 w-3.5 text-[#8c909f]" />
        <input 
          type="text" 
          placeholder="Rechercher une IP bannie..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none text-xs text-[#e1e2ec] w-full"
        />
      </div>

      <div className="rounded-sm border border-[#1d2027] bg-[#0c0e12]/60 overflow-hidden">
        <Table>
          <TableHeader className="bg-[#10131a] border-b border-[#1d2027] text-[10px] uppercase">
            <TableRow className="hover:bg-transparent border-[#1d2027]">
              <TableHead className="text-[#8c909f] pl-4">Index Règle</TableHead>
              <TableHead className="text-[#8c909f]">Horodatage Ban</TableHead>
              <TableHead className="text-[#8c909f]">Adresse IP Interdite</TableHead>
              <TableHead className="text-[#8c909f]">Justification d'Anomalie</TableHead>
              <TableHead className="text-right text-[#8c909f] pr-4">État Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-xs">
            {filtered.length === 0 ? (
              <TableRow className="border-[#1d2027]">
                <TableCell colSpan={5} className="h-24 text-center text-[#8c909f] italic">
                  Aucun hôte banni trouvé dans le registre IPSET.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item, idx) => (
                <TableRow key={idx} className="hover:bg-[#10131a]/50 border-b border-[#1d2027]/40">
                  <TableCell className="font-bold text-[#8c909f] pl-4">{item.rule_index}</TableCell>
                  <TableCell className="text-[#c2c6d6]">{item.banned_at}</TableCell>
                  <TableCell className="text-[#ffb4ab] font-bold">{item.ip}</TableCell>
                  <TableCell className="text-[#c2c6d6] text-[11px] font-sans">{item.reason}</TableCell>
                  <TableCell className="text-right pr-4">
                    <span className="inline-flex items-center gap-1 text-[#ffb4ab] bg-[#ba1a1a]/10 px-2 py-0.5 rounded-sm border border-[#ba1a1a]/20 text-[10px] font-bold uppercase">
                      <Server className="h-3 w-3" /> DROP_ACTIVE
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
