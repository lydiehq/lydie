import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { Editor } from "@/components/Editor";
import { TabBar } from "@/components/editor/TabBar";
import { Button } from "@/components/generic/Button";
import { Surface } from "@/components/layout/Surface";
import { useOrganization } from "@/context/organization.context";
import { useOrganizationTabs } from "@/hooks/use-tabs";

export const Route = createFileRoute("/__auth/w/$organizationSlug/$id/")({
  component: RouteComponent,
  ssr: false,
  loader: async ({ context, params }) => {
    const { zero, organization } = context;
    const { id } = params;

    const doc = zero.run(
      queries.documents.byId({
        organizationId: organization.id,
        documentId: id,
      }),
    );

    return { doc };
  },
});

function RouteComponent() {
  const { id } = Route.useParams();
  const { organization } = useOrganization();
  const { tabs, setTabs, activeTabId, setActiveTabId } = useOrganizationTabs();

  const [doc, status] = useQuery(
    queries.documents.byId({
      organizationId: organization.id,
      documentId: id,
    }),
  );

  // Add document to tabs when route changes
  useEffect(() => {
    if (doc && !tabs.some((t) => t.id === id)) {
      setTabs([...tabs, { id, title: doc.title || "Untitled" }]);
    }
    if (doc) {
      setActiveTabId(id);
    }
  }, [id, doc, tabs, setTabs, setActiveTabId]);

  // Update tab title when document title changes
  useEffect(() => {
    if (doc) {
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === id ? { ...tab, title: doc.title || "Untitled" } : tab,
        ),
      );
    }
  }, [doc?.title, id, setTabs]);

  if (!doc && status.type === "complete") {
    return (
      <div className="h-screen py-1 pr-1 flex flex-col pl-1">
        <Surface className="flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-y-2">
            <span className="text-sm font-medium text-gray-900">Document not found</span>
            <p className="text-sm text-gray-500">
              {" "}
              The document you are looking for does not exist.
            </p>
            <Button size="sm" href={`/w/${organization?.slug}`}>
              Go back
            </Button>
          </div>
        </Surface>
      </div>
    );
  }
  if (!doc) return null;

  return (
    <>
      <TabBar />
      {tabs.map((tab) => (
        <TabContent key={tab.id} tabId={tab.id} isActive={tab.id === activeTabId || tab.id === id} />
      ))}
    </>
  );
}

function TabContent({ tabId, isActive }: { tabId: string; isActive: boolean }) {
  const { organization } = useOrganization();
  const [doc] = useQuery(
    queries.documents.byId({
      organizationId: organization.id,
      documentId: tabId,
    }),
  );

  if (!doc) return null;

  return (
    <div style={{ display: isActive ? "block" : "none" }}>
      <Editor doc={doc} />
    </div>
  );
}
