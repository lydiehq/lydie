import { ChevronDownRegular } from "@fluentui/react-icons";
import type { LLMModel } from "@lydie/core/ai/models";
import {
  getAllModels,
  getDefaultModel,
  getModelsByProvider,
  getProviderDisplayName,
  getProviderOrder,
} from "@lydie/core/ai/models";
import { Button } from "@lydie/ui/components/generic/Button";
import { Popover } from "@lydie/ui/components/generic/Popover";
import { SelectItem } from "@lydie/ui/components/generic/Select";
import { useMemo, useState } from "react";
import {
  Select as AriaSelect,
  ListBox,
  ListBoxSection,
  Header,
  Collection,
} from "react-aria-components";

import { ModelIcon } from "./ModelIcon";

interface ModelSelectorProps {
  selectedModelId: string | null;
  onSelectModel: (modelId: string) => void;
}

export function ModelSelector({ selectedModelId, onSelectModel }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const allModels = useMemo(() => getAllModels(), []);
  const modelsByProvider = useMemo(() => getModelsByProvider(), []);
  const providerOrder = useMemo(() => getProviderOrder(), []);

  const currentModel = useMemo(() => {
    if (selectedModelId) {
      return allModels.find((m) => m.id === selectedModelId);
    }
    return getDefaultModel();
  }, [allModels, selectedModelId]);

  return (
    <AriaSelect
      value={currentModel?.id || null}
      onChange={(key) => {
        if (key && typeof key === "string") {
          onSelectModel(key);
          setIsOpen(false);
        }
      }}
      aria-label="Select AI model"
      className="group flex flex-col gap-1"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <Button intent="ghost" size="sm" className="gap-1.5">
        <ModelIcon provider={currentModel?.provider || "openai"} className="size-3 text-gray-500" />
        <span className="text-sm text-gray-600">{currentModel?.name || "Select model"}</span>
        <ChevronDownRegular className="size-3 text-gray-400 shrink-0" aria-hidden="true" />
      </Button>
      <Popover className="min-w-[320px] max-h-[500px] flex flex-col p-0" placement="top start">
        <div className="p-2 border-b border-gray-100">
          <span className="text-xs font-medium text-gray-500">Select a model</span>
        </div>
        <ListBox
          className="outline-none overflow-auto"
          selectionMode="single"
          selectedKeys={currentModel ? [currentModel.id] : []}
        >
          {providerOrder.map((provider) => {
            const providerModels = modelsByProvider.get(provider);
            if (!providerModels || providerModels.length === 0) return null;

            return (
              <ListBoxSection key={provider}>
                <Header className="px-3 py-2 bg-gray-50 flex items-center gap-2">
                  <ModelIcon provider={provider} className="size-4 text-gray-600" />
                  <span className="text-xs font-medium text-gray-600">
                    {getProviderDisplayName(provider)}
                  </span>
                </Header>
                <Collection items={providerModels}>
                  {(model: LLMModel) => {
                    const isSelected = model.id === currentModel?.id;

                    return (
                      <SelectItem
                        id={model.id}
                        textValue={model.name}
                        className={isSelected ? "bg-blue-50" : ""}
                      >
                        <div className="flex items-center gap-2 w-full py-2">
                          <span
                            className={`text-sm flex-1 truncate ${isSelected ? "font-semibold text-gray-900" : "text-gray-700"}`}
                          >
                            {model.name}
                          </span>
                          {model.isBeta && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                              Beta
                            </span>
                          )}
                          <span className="text-xs text-gray-500 font-medium">
                            {model.credits}c
                          </span>
                        </div>
                      </SelectItem>
                    );
                  }}
                </Collection>
              </ListBoxSection>
            );
          })}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
