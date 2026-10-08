import * as React from "react";
import { ShieldCheck, ShieldAlert, Bug, ScanLine, Laptop, ServerCog, Cpu } from "lucide-react";
import { Widget } from "./Widget";
import { KpiCard } from "./KpiCard";
import { StatusRing } from "./StatusRing";
import { Sparkline } from "./Sparkline";

const agents = [
  { name: "snort-edge-01", status: "online", seen: "2s ago", ip: "10.0.2.15" },
  { name: "snort-edge-02", status: "online", seen: "5s ago", ip: "10.0.2.16" },
  { name: "core-switch-dc", status: "degraded", seen: "11s ago", ip: "192.168.1.1" },
  { name: "wifi-lan-gw", status: "online", seen: "3s ago", ip: "172.16.0.1" },
  { name: "remote-probe-03", status: "offline", seen: "4m ago", ip: "45.128.232.11" },
];

const osDist = [
  { name: "Ubuntu 22.04", pct: 48, color: "#4d8eff" },
  { name: "Debian 12", pct: 27, color: "#adc6ff" },
  { name: "Windows Server", pct: 17, color: "#ffb361" },
  { name: "Other", pct: 8, color: "#ff5a5a" },
];

const statusStyle: Record<string, string> = {
  online: "text-secure-soft",
  degraded: "text-warning-soft",
  offline: "text-critical-soft",
};

export function EndpointSecurityView() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Agents Online"
          value="42 / 46"
          icon={<ShieldCheck className="h-4 w-4" />}
          accent="secure"
          delta={{ text: "91% fleet", direction: "up", tone: "good" }}
          spark={[38, 39, 40, 40, 41, 41, 42, 42, 43, 43, 44, 42]}
          footnote="Sensors reporting heartbeat"
        />
        <KpiCard
          label="Isolated Hosts"
          value="3"
          icon={<ShieldAlert className="h-4 w-4" />}
          accent="critical"
          delta={{ text: "Containment active", direction: "up", tone: "bad" }}
          spark={[0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3]}
          footnote="Network quarantine enforced"
        />
        <KpiCard
          label="Critical Vulns"
          value="7"
          icon={<Bug className="h-4 w-4" />}
          accent="warning"
          delta={{ text: "Patch pending", direction: "flat", tone: "neutral" }}
          spark={[12, 11, 11, 10, 9, 9, 8, 8, 8, 7, 7, 7]}
          footnote="CVEs w/ available fix"
        />
        <KpiCard
          label="Policy Coverage"
          value="98.6"
          unit="%"
          icon={<ScanLine className="h-4 w-4" />}
          accent="info"
          delta={{ text: "+0.4% wk", direction: "up", tone: "good" }}
          spark={[96, 96, 97, 97, 97, 98, 98, 98, 98, 98, 99, 98.6]}
          footnote="Endpoints under baseline"
        />
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="Fleet Posture" subtitle="Endpoint security health" icon={<Cpu className="h-4 w-4" />} accent="secure">
          <div className="flex flex-col items-center gap-4">
            <StatusRing value={91} size={148} stroke={11} color="#22c55e" label="Protected" sublabel="46 endpoints" />
            <div className="grid w-full grid-cols-3 gap-2 text-center font-data-mono text-[10px]">
              <div className="rounded-md border border-edge bg-surface-2/60 py-2">
                <div className="text-secure-soft text-base font-bold">42</div>
                <div className="text-[#8c909f]">Online</div>
              </div>
              <div className="rounded-md border border-edge bg-surface-2/60 py-2">
                <div className="text-warning-soft text-base font-bold">1</div>
                <div className="text-[#8c909f]">Degraded</div>
              </div>
              <div className="rounded-md border border-edge bg-surface-2/60 py-2">
                <div className="text-critical-soft text-base font-bold">3</div>
                <div className="text-[#8c909f]">Isolated</div>
              </div>
            </div>
            <div className="w-full">
              <Sparkline data={[70, 74, 73, 78, 80, 79, 84, 86, 88, 90, 91, 91]} color="#22c55e" width={260} height={38} className="w-full" />
            </div>
          </div>
        </Widget>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="Agent Status" subtitle="Live sensor registry" icon={<Laptop className="h-4 w-4" />} accent="info" menuItems={[{ label: "Add agent" }, { label: "Rotate keys" }]} contentClassName="p-0">
          <ul className="divide-y divide-edge/40 font-data-mono text-[11px]">
            {agents.map((a) => (
              <li key={a.name} className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2/50">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${a.status === "online" ? "bg-secure" : a.status === "degraded" ? "bg-warning" : "bg-critical"}`} />
                  <div className="min-w-0">
                    <div className="truncate text-[#e1e2ec]">{a.name}</div>
                    <div className="truncate text-[9px] text-[#8c909f]">{a.ip}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-[10px] uppercase ${statusStyle[a.status]}`}>{a.status}</div>
                  <div className="text-[9px] text-[#8c909f]">{a.seen}</div>
                </div>
              </li>
            ))}
          </ul>
        </Widget>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <Widget title="OS Distribution" subtitle="Protected asset base" icon={<ServerCog className="h-4 w-4" />} accent="warning">
          <div className="space-y-4">
            {osDist.map((o) => (
              <div key={o.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-data-sans-serif text-[11px]">
                  <span className="text-[#c2c6d6]">{o.name}</span>
                  <span className="font-bold" style={{ color: o.color }}>{o.pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full" style={{ width: `${o.pct}%`, background: o.color }} />
                </div>
              </div>
            ))}
          </div>
        </Widget>
      </div>

      <div className="col-span-12">
        <Widget title="Threat Evolution" subtitle="Endpoint detections over 24h" icon={<Bug className="h-4 w-4" />} accent="critical" contentClassName="p-3">
          <div className="h-[220px] w-full">
            <Sparkline data={[3, 5, 4, 7, 6, 9, 8, 12, 10, 14, 11, 16, 13, 18, 15, 21, 17, 24, 19, 22]} color="#ff5a5a" width={900} height={220} fill strokeWidth={2} className="h-full w-full" showDot={false} />
          </div>
        </Widget>
      </div>
    </div>
  );
}
