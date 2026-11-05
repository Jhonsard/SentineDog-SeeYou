import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const NAV_GROUPS = [
  {
    title: "Surveillance",
    items: [
      { key: "dashboard", label: "Vue d'ensemble" },
      { key: "alerts", label: "Alertes" },
      { key: "network", label: "Réseau" },
      { key: "logs", label: "Journaux" },
    ],
  },
  {
    title: "Protection",
    items: [
      { key: "blacklist", label: "Liste noire" },
      { key: "threat-intel", label: "Threat intelligence" },
      { key: "assets", label: "Actifs" },
      { key: "endpoint", label: "Terminaux" },
    ],
  },
  {
    title: "Administration",
    items: [{ key: "settings", label: "Paramètres" }],
  },
] as const;

interface AppSidebarProps {
  activeKey: string;
  onSelect: (key: string) => void;
}

export function AppSidebar({ activeKey, onSelect }: AppSidebarProps) {
  const { setOpenMobile } = useSidebar();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Surveillance: true,
    Protection: true,
    Administration: true,
  });

  const handleSelect = (key: string) => {
    onSelect(key);
    setOpenMobile(false);
  };

  const toggleGroup = (title: string) => {
    setOpenGroups((current) => ({
      ...current,
      [title]: !current[title],
    }));
  };

  const isItemActive = (key: string) =>
    activeKey === key ||
    (key === "assets" && activeKey === "nodes") ||
    (key === "logs" && activeKey === "reports");

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => handleSelect("dashboard")}
            >
              <img
                src="/Seeyou.webp"
                alt="SeeYou"
                className="h-8 w-8 rounded-md border border-sidebar-border object-cover"
              />
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">SeeYou</span>
                <span className="text-xs text-sidebar-foreground/70">
                  SENTINEDOG SOC
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const isOpen = openGroups[group.title] ?? true;

          return (
            <SidebarGroup key={group.title}>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => toggleGroup(group.title)}
                    aria-expanded={isOpen}
                  >
                    <span className="font-medium">{group.title}</span>
                  </SidebarMenuButton>

                  {isOpen && (
                    <SidebarMenuSub>
                      {group.items.map((item) => (
                        <SidebarMenuSubItem key={item.key}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isItemActive(item.key)}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelect(item.key)}
                            >
                              {item.label}
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => handleSelect("profile")}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-sidebar-border bg-sidebar text-[11px] font-bold">
                AS
              </span>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">Admin SOC</span>
                <span className="text-xs text-sidebar-foreground/70">
                  ULPGL Goma
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
