import { DeleteRegular, EditRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Label } from "@lydie/ui/components/generic/Field";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { SectionHeader } from "@lydie/ui/components/layout/SectionHeader";
import { Separator } from "@lydie/ui/components/layout/Separator";
import { mutators } from "@lydie/zero/mutators";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Input, TextArea } from "react-aria-components";
import { toast } from "sonner";

import { Link } from "@/components/generic/Link";
import { Card } from "@/components/layout/Card";
import { useOrganization } from "@/context/organization.context";
import { useZero } from "@/services/zero";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/ai")({
  component: RouteComponent,
});

function RouteComponent() {
  const { organization } = useOrganization();
  const z = useZero();

  const [allAgents] = useQuery(queries.agents.available({ organizationId: organization.id }));
  const [agents] = useQuery(queries.agents.byUser({ organizationId: organization.id }));
  const [isCreating, setIsCreating] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    systemPrompt: "",
  });

  const isPro = useMemo(() => {
    if (!organization) return false;
    return organization.subscriptionPlan === "pro" && organization.subscriptionStatus === "active";
  }, [organization]);

  const defaultAgents = useMemo(() => {
    return allAgents?.filter((agent) => agent.is_default) || [];
  }, [allAgents]);

  const handleCreateAgent = async () => {
    if (!formData.name.trim() || !formData.systemPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }

    try {
      await z.mutate(
        mutators.agents.create({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          systemPrompt: formData.systemPrompt.trim(),
          organizationId: organization.id,
        }),
      );
      toast.success("Agent created successfully");
      setIsCreating(false);
      setFormData({ name: "", description: "", systemPrompt: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to create agent");
      console.error("Agent creation error:", error);
    }
  };

  const handleUpdateAgent = async (agentId: string) => {
    if (!formData.name.trim() || !formData.systemPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }

    try {
      await z.mutate(
        mutators.agents.update({
          agentId,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          systemPrompt: formData.systemPrompt.trim(),
          organizationId: organization.id,
        }),
      );
      toast.success("Agent updated successfully");
      setEditingAgentId(null);
      setFormData({ name: "", description: "", systemPrompt: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to update agent");
      console.error("Agent update error:", error);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm("Are you sure you want to delete this agent?")) {
      return;
    }

    try {
      await z.mutate(
        mutators.agents.delete({
          agentId,
          organizationId: organization.id,
        }),
      );
      toast.success("Agent deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete agent");
      console.error("Agent deletion error:", error);
    }
  };

  const handleStartEdit = (agent: any) => {
    setEditingAgentId(agent.id);
    setFormData({
      name: agent.name,
      description: agent.description || "",
      systemPrompt: agent.system_prompt,
    });
    setIsCreating(false);
  };

  const handleCancelEdit = () => {
    setEditingAgentId(null);
    setIsCreating(false);
    setFormData({ name: "", description: "", systemPrompt: "" });
  };

  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <Heading level={1}>AI Settings</Heading>
      </div>
      <Separator />

      {/* Default Agents Section */}
      <div className="flex flex-col gap-y-6">
        <SectionHeader
          heading="Default Agents"
          description="These are the default AI agents available to all users. Each agent has a unique personality and writing style optimized for different tasks."
          descriptionClassName="text-sm/relaxed text-gray-700"
        />

        {defaultAgents.length > 0 && (
          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-medium text-gray-900">Available Default Agents</h3>
            <div className="space-y-3">
              {defaultAgents.map((agent) => (
                <div key={agent.id} className="p-4 border border-gray-200 rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">{agent.name}</h4>
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      </div>
                      {agent.description && (
                        <p className="text-xs text-gray-600 mt-1">{agent.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                    <p className="text-xs text-gray-600 leading-relaxed">{agent.system_prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Separator />

      {/* Custom Agents Section */}
      <div className="flex flex-col gap-y-6">
        <SectionHeader
          heading="Custom Agents"
          description="Create custom AI agents with specific personalities and writing styles for different tasks. All users can use the default agents above."
          descriptionClassName="text-sm/relaxed text-gray-700"
        />

        {isPro ? (
          <>
            {/* List of custom agents */}
            {agents && agents.length > 0 && (
              <Card className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Your Custom Agents</h3>
                <div className="space-y-3">
                  {agents.map((agent) => (
                    <div key={agent.id} className="p-4 border border-gray-200 rounded-lg space-y-2">
                      {editingAgentId === agent.id ? (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-sm font-medium">Name</Label>
                            <Input
                              value={formData.name}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setFormData({
                                  ...formData,
                                  name: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Description</Label>
                            <Input
                              value={formData.description}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                setFormData({
                                  ...formData,
                                  description: e.target.value,
                                })
                              }
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-medium">System Prompt</Label>
                            <TextArea
                              value={formData.systemPrompt}
                              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                                setFormData({
                                  ...formData,
                                  systemPrompt: e.target.value,
                                })
                              }
                              rows={4}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 resize-y"
                            />
                          </div>
                          <div className="flex gap-x-2">
                            <Button size="sm" onPress={() => handleUpdateAgent(agent.id)}>
                              Save
                            </Button>
                            <Button size="sm" intent="secondary" onPress={handleCancelEdit}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium text-sm">{agent.name}</h4>
                              {agent.description && (
                                <p className="text-xs text-gray-600 mt-1">{agent.description}</p>
                              )}
                            </div>
                            <div className="flex gap-x-1">
                              <Button
                                size="sm"
                                intent="ghost"
                                onPress={() => handleStartEdit(agent)}
                                aria-label="Edit agent"
                              >
                                <EditRegular className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                intent="ghost"
                                onPress={() => handleDeleteAgent(agent.id)}
                                aria-label="Delete agent"
                              >
                                <DeleteRegular className="size-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                            <p className="text-xs text-gray-600 leading-relaxed">
                              {agent.system_prompt}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Create new agent form */}
            {isCreating ? (
              <Card className="p-6 space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Create New Agent</h3>
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <Input
                    value={formData.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., Technical Writer"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Description (optional)</Label>
                  <Input
                    value={formData.description}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Brief description of this agent's purpose"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">System Prompt</Label>
                  <TextArea
                    value={formData.systemPrompt}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setFormData({ ...formData, systemPrompt: e.target.value })
                    }
                    placeholder="You are a..."
                    rows={6}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 resize-y"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Define how this agent should behave and write. Be specific about tone, style,
                    and approach.
                  </p>
                </div>
                <div className="flex gap-x-2">
                  <Button size="sm" onPress={handleCreateAgent}>
                    Create Agent
                  </Button>
                  <Button size="sm" intent="secondary" onPress={handleCancelEdit}>
                    Cancel
                  </Button>
                </div>
              </Card>
            ) : (
              <div>
                <Button size="sm" onPress={() => setIsCreating(true)}>
                  Create New Agent
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card className="p-6">
            <div className="flex flex-col gap-y-3">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-1">Unlock Custom Agents</h3>
                <p className="text-xs text-gray-600">
                  Upgrade to Pro to create unlimited custom AI agents tailored to your specific
                  needs. Premium users can create agents for any writing task, from technical
                  documentation to creative content.
                </p>
              </div>
              <Link
                to="/w/$organizationSlug/settings/billing"
                params={{ organizationSlug: organization.slug }}
              >
                <Button size="sm">Upgrade to Pro</Button>
              </Link>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
