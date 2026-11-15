import React from "react";
import type {
  TabListProps,
  TabPanelProps,
  TabPanelsProps,
  TabProps,
  TabsProps,
} from "react-aria-components";
import {
  composeRenderProps,
  Tab as RACTab,
  TabList as RACTabList,
  TabPanel as RACTabPanel,
  TabPanels as RACTabPanels,
  Tabs as RACTabs,
} from "react-aria-components";
import { tv } from "tailwind-variants";

import { focusRing } from "./utils";

const tabsStyles = tv({
  base: "flex gap-4",
  variants: {
    orientation: {
      horizontal: "flex-col",
      vertical: "flex-row w-[800px]",
    },
  },
});

export function Tabs(props: TabsProps) {
  return (
    <RACTabs
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tabsStyles({ ...renderProps, className }),
      )}
    />
  );
}

const tabListStyles = tv({
  base: "flex gap-1",
  variants: {
    orientation: {
      horizontal: "flex-row",
      vertical: "flex-col items-start",
    },
  },
});

export function TabList<T extends object>(props: TabListProps<T>) {
  return (
    <RACTabList
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tabListStyles({ ...renderProps, className }),
      )}
    />
  );
}

const tabProps = tv({
  extend: focusRing,
  base: "flex items-center cursor-default rounded-full px-4 py-1.5 text-sm font-medium forced-color-adjust-none",
  variants: {
    isSelected: {
      false:
        "text-gray-600 hover:text-gray-700 pressed:text-gray-700 hover:bg-gray-200 pressed:bg-gray-200",
      true: "text-surface forced-colors:text-[HighlightText] bg-gray-800 forced-colors:bg-[Highlight]",
    },
    isDisabled: {
      true: "text-gray-200 forced-colors:text-[GrayText] selected:text-gray-300 forced-colors:selected:text-[HighlightText] selected:bg-gray-200 forced-colors:selected:bg-[GrayText]",
    },
  },
});

export function Tab(props: TabProps) {
  return (
    <RACTab
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tabProps({ ...renderProps, className }),
      )}
    />
  );
}

export function TabPanels<T extends object>(props: TabPanelsProps<T>) {
  return <RACTabPanels {...props} />;
}

const tabPanelStyles = tv({
  extend: focusRing,
  base: "flex-1 p-4 text-sm text-gray-900",
});

export function TabPanel(props: TabPanelProps) {
  return (
    <RACTabPanel
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tabPanelStyles({ ...renderProps, className }),
      )}
    />
  );
}
