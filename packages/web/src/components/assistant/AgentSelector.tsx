import { ChevronDownRegular } from "@fluentui/react-icons";
import { getAllDefaultAgents } from "@lydie/core/ai/agents/defaults";
import { Button } from "@lydie/ui/components/generic/Button";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { SelectItem } from "@lydie/ui/components/generic/Select";
import { queries } from "@lydie/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";
import { Select as AriaSelect, ListBox, SelectValue } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";

interface AgentSelectorProps {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

interface CombinedAgent {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
}

export function AgentSelector({ selectedAgentId, onSelectAgent }: AgentSelectorProps) {
  const { organization } = useOrganization();
  const [customAgents] = useQuery(
    queries.agents.byUser({
      organizationId: organization.id,
    }),
  );

  const allAgents = useMemo<CombinedAgent[]>(() => {
    const defaults = getAllDefaultAgents().map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      is_default: true as const,
    }));

    const customs = (customAgents || []).map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      is_default: false as const,
    }));

    return [...defaults, ...customs];
  }, [customAgents]);

  const currentAgent = useMemo(() => {
    return allAgents.find((a) => a.id === selectedAgentId);
  }, [allAgents, selectedAgentId]);

  const displayName = useMemo(() => {
    if (currentAgent) {
      return currentAgent.name;
    }
    return "Default";
  }, [currentAgent]);

  if (allAgents.length === 0) {
    return null;
  }

  return (
    <AriaSelect
      value={selectedAgentId || null}
      onChange={(key) => {
        if (key && typeof key === "string") {
          onSelectAgent(key);
        }
      }}
      aria-label="Select AI agent"
      className="group flex flex-col gap-1"
    >
      <Button intent="ghost" size="sm">
        <SelectValue className="max-w-[150px] truncate text-sm">
          {({ selectedText }) => selectedText || displayName}
        </SelectValue>
        <ChevronDownRegular className="size-3.5 text-gray-500 shrink-0" aria-hidden="true" />
      </Button>
      <Popover className="min-w-[250px] max-h-[400px] flex flex-col p-0" placement="bottom start">
        <ListBox items={allAgents} className="outline-none overflow-auto" selectionMode="single">
          {(agent: CombinedAgent) => {
            const isSelected = agent.id === selectedAgentId;
            const isDefault = agent.is_default;

            return (
              <SelectItem
                id={agent.id}
                textValue={agent.name}
                className={isSelected ? "bg-blue-50" : ""}
              >
                <div className="flex flex-col items-start gap-1 w-full max-w-sm">
                  <div className="flex items-center gap-2 w-full">
                    <span className={`text-sm flex-1 ${isSelected ? "font-semibold" : ""}`}>
                      {agent.name}
                    </span>
                    {isDefault && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  {agent.description && (
                    <span className="text-xs text-gray-500">{agent.description}</span>
                  )}
                </div>
              </SelectItem>
            );
          }}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
