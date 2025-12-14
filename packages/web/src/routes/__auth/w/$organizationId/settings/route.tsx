import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Card } from "@/components/layout/Card";
import {
  User,
  Settings,
  Sparkles,
  CreditCard,
  Box,
  Upload,
} from "lucide-react";
import { sidebarItemStyles } from "@/components/layout/Sidebar";

export const Route = createFileRoute("/__auth/w/$organizationId/settings")({
  component: RouteComponent,
});

const settingsRoutes = [
  {
    title: "Account",
    routes: [
      {
        path: "/w/$organizationId/settings/user",
        label: "Preferences",
        icon: User,
      },
      {
        path: "/w/$organizationId/settings/ai",
        label: "AI Settings",
        icon: Sparkles,
      },
    ],
  },
  {
    title: "Workspace",
    routes: [
      {
        path: "/w/$organizationId/settings",
        label: "General",
        icon: Settings,
      },
      {
        path: "/w/$organizationId/settings/billing",
        label: "Billing & Usage",
        icon: CreditCard,
      },
      {
        path: "/w/$organizationId/settings/components",
        label: "Components",
        icon: Box,
      },
      {
        path: "/w/$organizationId/settings/import",
        label: "Import",
        icon: Upload,
      },
    ],
  },
];

function RouteComponent() {
  return (
    <div className="p-1 size-full">
      <Card className="overflow-y-auto">
        <div className="mx-auto max-w-5xl gap-x-8 flex size-full grow p-12 overflow-visible">
          <nav aria-label="Settings navigation" className="w-[200px] shrink-0">
            <ul className="flex flex-col gap-y-2">
              {settingsRoutes.map((section) => (
                <li key={section.title} className="flex flex-col gap-y-2">
                  <span className="text-xs font-medium text-gray-500">
                    {section.title}
                  </span>
                  <ul className="flex flex-col">
                    {section.routes.map((route) => {
                      const Icon = route.icon;
                      return (
                        <li key={route.path}>
                          <Link
                            to={route.path}
                            from="/w/$organizationId/settings"
                            className={sidebarItemStyles()}
                            activeOptions={{ exact: true }}
                          >
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {Icon && (
                                <Icon className="size-4 text-gray-500" />
                              )}
                              <span className="truncate flex-1">
                                {route.label}
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>
          <div className="grow">
            <Outlet />
          </div>
        </div>
      </Card>
    </div>
  );
}
