import type { ReactNode } from "react";

import { Command } from "cmdk";

import type { MenuItem } from "./CommandMenuItem";

import { CommandMenuItem } from "./CommandMenuItem";

function CommandGroupHeading({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-gray-500 dark:text-gray-400 px-3 py-1 text-left">{children}</div>
  );
}

export interface MenuSection {
  id: string;
  heading: string;
  items: MenuItem[];
}

interface CommandMenuSectionProps {
  section: MenuSection;
  onSelect?: (item: MenuItem) => void;
}

export function CommandMenuSection({ section, onSelect }: CommandMenuSectionProps) {
  return (
    <Command.Group
      key={section.id}
      heading={<CommandGroupHeading>{section.heading}</CommandGroupHeading>}
    >
      {section.items.map((item) => (
        <CommandMenuItem key={item.id} item={item} onSelect={onSelect} />
      ))}
    </Command.Group>
  );
}
