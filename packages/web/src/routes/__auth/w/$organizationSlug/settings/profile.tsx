import { Heading } from "@lydie/ui/components/generic/Heading";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { createFileRoute } from "@tanstack/react-router";

import { ProfileForm } from "@/components/settings/profile/ProfileForm";
import { useAuth } from "@/context/auth.context";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/profile")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="flex flex-col gap-y-6">
        <div>
          <Heading level={1}>Profile</Heading>
        </div>
        <Separator />
        <div className="text-sm text-gray-500">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>Profile</Heading>
      </div>
      <Separator />

      <div className="flex flex-col gap-y-4">
        <SectionHeader
          heading="Profile Information"
          description="Update your profile information and profile picture."
        />
        <ProfileForm user={user} />
      </div>
    </div>
  );
}
