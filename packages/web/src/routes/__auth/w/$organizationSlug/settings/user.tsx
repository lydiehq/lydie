import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";

import { Heading } from "@lydie/ui/components/generic/Heading";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { PendingInvitationsSection } from "@/components/settings/user/PendingInvitationsSection";
import { PreferencesSection } from "@/components/settings/user/PreferencesSection";
import { useAuth } from "@/context/auth.context";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/user")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuth();

  const [userSettings] = useQuery(queries.settings.user({}));
  const [userInvitations] = useQuery(
    queries.invitations.byUser({
      email: user.email,
    }),
  );

  if (!userSettings) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>User Settings</Heading>
        </div>
        <Separator />
        <div className="text-sm text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>User Settings</Heading>
      </div>
      <Separator />

      {/* Preferences Section */}
      <div className="flex flex-col gap-y-6">
        <SectionHeader
          heading="Preferences"
          description="Customize your personal preferences and settings."
          descriptionClassName="text-sm/relaxed text-gray-700"
        />
        <PreferencesSection userSettings={userSettings} />
      </div>

      <Separator />

      {/* Pending Invitations Section */}
      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="Pending Invitations"
          description="You have been invited to join these organizations."
        />
        <PendingInvitationsSection invitations={userInvitations} />
      </div>
    </div>
  );
}
