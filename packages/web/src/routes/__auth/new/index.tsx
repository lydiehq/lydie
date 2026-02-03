import { getRandomColor } from "@lydie/core/colors";
import { createId } from "@lydie/core/id";
import { slugify } from "@lydie/core/utils";
import { Button } from "@lydie/ui/components/generic/Button";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery as useZeroQuery } from "@rocicorp/zero/react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { Form } from "react-aria-components";
import z from "zod";

import { documentTreeExpandedKeysAtom } from "@/components/layout/DocumentTree";
import { useAppForm } from "@/hooks/use-app-form";
import { revalidateSession } from "@/lib/auth/session";
import { clearZeroInstance } from "@/lib/zero/instance";
import { useZero } from "@/services/zero";
import { authClient } from "@/utils/auth";

export const Route = createFileRoute("/__auth/new/")({
  component: RouteComponent,
  validateSearch: (search) => z.object({ template: z.string().optional() }).parse(search),
});

function RouteComponent() {
  const z = useZero();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const setExpandedKeys = useSetAtom(documentTreeExpandedKeysAtom);
  const { auth } = Route.useRouteContext();
  const search = Route.useSearch();

  const defaultName = auth?.user?.name
    ? `${auth.user.name.split(" ")[0]}'s Workspace`
    : "My Workspace";

  const form = useAppForm({
    defaultValues: {
      name: defaultName,
    },
    onSubmit: async (values) => {
      try {
        const id = createId();
        const onboardingDocId = createId();
        // Generate slug with unique suffix to avoid clashes
        const slug = `${slugify(values.value.name)}-${id.slice(0, 8)}`;

        const write = z.mutate(
          mutators.organization.create({
            id,
            name: values.value.name,
            slug,
            color: getRandomColor().value,
            onboardingDocId,
          }),
        );

        await write.server;

        await revalidateSession(queryClient);
        clearZeroInstance();
        await router.invalidate();

        // Expand the onboarding document in the sidebar
        setExpandedKeys([onboardingDocId]);

        // Navigate to the onboarding document or workspace with template
        if (search.template) {
          navigate({
            to: "/w/$organizationSlug",
            params: { organizationSlug: slug },
            search: { installTemplate: search.template },
          });
        } else {
          navigate({
            to: "/w/$organizationSlug/$id",
            params: { organizationSlug: slug, id: onboardingDocId },
          });
        }
      } catch (error) {
        console.error("Failed to create workspace:", error);
      }
    },
  });

  const [invitations] = useZeroQuery(
    queries.invitations.byUser({ email: auth?.user?.email || "" }),
  );

  const acceptInvitation = async (invitationId: string) => {
    try {
      await authClient.organization.acceptInvitation({
        invitationId,
      });
      await revalidateSession(queryClient);
      await router.invalidate();
      navigate({ to: "/" });
    } catch {}
  };

  return (
    <div className="min-h-screen relative grainy-gradient-container custom-inner-shadow overflow-hidden">
      <svg className="grainy-gradient-svg">
        <filter id="noiseFilter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
          ></feTurbulence>
        </filter>
      </svg>
      <svg
        viewBox="0 0 256 256"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "absolute",
          top: "50%",
          right: "20%",
          transform: "translateY(-50%)",
          width: "2000px",
          pointerEvents: "none",
          zIndex: 2,
          color: "rgba(0, 0, 0, 0.2)",
        }}
      >
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M41.27 222.049c-.67-.618-.218-1.727.695-1.712 37.82.621 81.574-4.599 123.467-20.608 31.858-12.175 62.564-30.604 88.556-57.154.664-.679 1.812-.141 1.699.802C248.073 206.82 193.944 256 128.302 256c-33.588 0-64.162-12.876-87.032-33.951ZM8.475 172.36a.985.985 0 0 1-.797-.643C2.71 158.076 0 143.354 0 128 0 57.308 57.443 0 128.302 0c53.062 0 98.601 32.136 118.129 77.965a.999.999 0 0 1-.072.916c-24.815 39.85-59.9 64.094-97.239 78.364-49.113 18.769-102.352 20.214-140.645 15.115Z"
          clipRule="evenodd"
        ></path>
      </svg>
      <div className="relative z-10 flex items-center justify-center min-h-screen p-8 md:p-16">
        <div className="w-full max-w-lg">
          <div className="p-px ring ring-white/20 rounded-[9px] bg-white/10">
            <div className="p-8 md:p-16 size-full rounded-[8px] flex flex-col gap-8">
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  form.handleSubmit();
                }}
                className="flex flex-col gap-y-8"
              >
                <div className="gap-y-2 flex flex-col">
                  <Heading className="text-white">Create Workspace</Heading>
                  <p className="text-white/90">
                    Use workspaces for different areas of your company, or to separate your live and
                    test environments.
                  </p>
                </div>

                <div className="gap-y-4 flex flex-col">
                  <form.AppField
                    name="name"
                    children={(field) => (
                      <field.TextField
                        label="Workspace Name"
                        placeholder="My Workspace"
                        description="This will be the name of your workspace"
                        labelClassName="text-white"
                        descriptionClassName="text-white/70"
                        className="text-white"
                      />
                    )}
                  />

                  <form.Subscribe
                    selector={(state) => state.isSubmitting}
                    children={(isSubmitting) => (
                      <Button
                        intent="primary"
                        type="submit"
                        isPending={isSubmitting}
                        className="w-full"
                      >
                        {isSubmitting ? "Creating workspace..." : "Create Workspace"}
                      </Button>
                    )}
                  />
                </div>
              </Form>

              {invitations && invitations.length > 0 && (
                <div className="border-t border-white/10 pt-8">
                  <div className="gap-y-2 flex flex-col mb-4">
                    <Heading className="text-white text-lg">Detailed Invitations</Heading>
                    <p className="text-white/90 text-sm">
                      You have been invited to join the following workspaces using{" "}
                      {auth?.user?.email}.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {invitations.map((invitation: any) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between p-3 rounded bg-white/5 border border-white/10"
                      >
                        <div className="flex flex-col">
                          <span className="text-white font-medium">
                            {invitation.organization?.name || "Unknown Organization"}
                          </span>
                          <span className="text-white/60 text-xs">
                            Invited by {invitation.inviter?.email || "Unknown"}
                          </span>
                        </div>
                        <Button size="sm" onPress={() => acceptInvitation(invitation.id)}>
                          Accept
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
