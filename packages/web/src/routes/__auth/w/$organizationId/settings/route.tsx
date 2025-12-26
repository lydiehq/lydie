import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Surface } from "@/components/layout/Surface";
import {
  User,
  Settings,
  Sparkles,
  CreditCard,
  Box,
  Upload,
  Puzzle,
  Book,
  ExternalLink,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { sidebarItemStyles } from "@/components/layout/Sidebar";
import { Eyebrow } from "@/components/generic/Eyebrow";
import { useAuth } from "@/context/auth.context";
import { isAdmin } from "@/utils/admin";

export const Route = createFileRoute("/__auth/w/$organizationId/settings")({
  component: RouteComponent,
});

type SettingsRoute = {
  path: string;
  label: string;
  icon: LucideIcon;
  external?: boolean;
  adminOnly?: boolean;
};

type SettingsSection = {
  title: string;
  routes: SettingsRoute[];
};

const settingsRoutes: SettingsSection[] = [
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
        path: "/w/$organizationId/settings/admin",
        label: "Admin",
        icon: ShieldCheck,
        adminOnly: true,
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
        adminOnly: true,
      },
      {
        path: "/w/$organizationId/settings/integrations/",
        label: "Integrations",
        icon: Puzzle,
      },
      {
        path: "/w/$organizationId/settings/import",
        label: "Import",
        icon: Upload,
        adminOnly: true,
      },
    ],
  },
  {
    title: "Miscellaneous",
    routes: [
      {
        path: "https://lydie.co/documentation",
        external: true,
        label: "Docs",
        icon: Book,
      },
    ],
  },
];

function RouteComponent() {
  const { user } = useAuth();
  const userIsAdmin = isAdmin(user);

  return (
    <div className="p-1 size-full">
      <Surface className="overflow-y-auto">
        <div className="mx-auto max-w-5xl gap-x-8 flex size-full grow p-12 overflow-visible">
          <nav aria-label="Settings navigation" className="w-[200px] shrink-0">
            <ul className="flex flex-col gap-y-2">
              {settingsRoutes.map((section) => (
                <li key={section.title} className="flex flex-col gap-y-2">
                  <Eyebrow>{section.title}</Eyebrow>
                  <ul className="flex flex-col">
                    {section.routes
                      .filter((route) => !route.adminOnly || userIsAdmin)
                      .map((route) => {
                        const Icon = route.icon;
                        return (
                          <li key={route.path}>
                            <Link
                              to={route.path}
                              from="/w/$organizationId/settings"
                              {...(route.external ? { target: "_blank" } : {})}
                              className={sidebarItemStyles()}
                              activeOptions={{
                                exact: true,
                                includeSearch: false,
                              }}
                            >
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                {Icon && (
                                  <Icon className="size-4 text-gray-500" />
                                )}
                                <span className="truncate flex-1">
                                  {route.label}
                                </span>
                                {route.external && (
                                  <ExternalLink className="size-3 text-gray-500" />
                                )}
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
      </Surface>
    </div>
  );
}
