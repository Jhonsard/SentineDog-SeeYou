import * as React from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface WidgetMenuItem {
  label: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
}

export interface WidgetProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Accent token for the icon chip: info | critical | warning | secure */
  accent?: "info" | "critical" | "warning" | "secure";
  /** Custom header actions (rendered before the kebab). */
  actions?: React.ReactNode;
  /** Items rendered in the standardized kebab action menu. */
  menuItems?: WidgetMenuItem[];
  /** Hide the kebab entirely. */
  hideMenu?: boolean;
  className?: string;
  contentClassName?: string;
  children?: React.ReactNode;
}

const accentMap: Record<NonNullable<WidgetProps["accent"]>, string> = {
  info: "bg-foreground/10 text-foreground border-foreground/20",
  critical: "bg-foreground/10 text-foreground border-foreground/20",
  warning: "bg-foreground/10 text-foreground border-foreground/20",
  secure: "bg-foreground/10 text-foreground border-foreground/20",
};

/**
 * CyberObserve DS standardized widget shell.
 * Every telemetry module shares the same header contract:
 * [ Icon chip ] Title + subtitle ............ [ actions ] [ ⋮ menu ]
 * Flat panel background, 1px structural border, no heavy shadow.
 */
export function Widget({
  title,
  subtitle,
  icon,
  accent = "info",
  actions,
  menuItems,
  hideMenu = false,
  className,
  contentClassName,
  children,
}: WidgetProps) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-md border border-border bg-card",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 rounded-t-md border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                accentMap[accent],
              )}
            >
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-ui truncate text-[13px] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h3>
            {subtitle && (
              <p className="font-data-mono truncate text-[10px] leading-tight text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {!hideMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Widget actions"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44 border-border bg-muted font-ui text-xs text-foreground"
              >
                {menuItems && menuItems.length > 0 ? (
                  <>
                    <DropdownMenuLabel className="font-data-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Actions
                    </DropdownMenuLabel>
                    {menuItems.map((item) => (
                      <DropdownMenuItem
                        key={item.label}
                        onClick={item.onSelect}
                        className={cn(
                          "cursor-pointer gap-2 font-ui",
                          item.destructive &&
                            "text-foreground focus:bg-muted focus:text-foreground",
                        )}
                      >
                        {item.icon}
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : (
                  <>
                    <DropdownMenuLabel className="font-data-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      Actions
                    </DropdownMenuLabel>
                    <DropdownMenuItem className="cursor-pointer gap-2 font-ui">
                      Export CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2 font-ui">
                      Refresh
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem className="cursor-pointer gap-2 font-ui">
                      Configure
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <div className={cn("flex-1 p-4", contentClassName)}>{children}</div>
    </section>
  );
}
