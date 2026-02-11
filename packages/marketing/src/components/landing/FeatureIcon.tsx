import {
  BotFilled,
  LinkFilled,
  PeopleFilled,
  SearchFilled,
  TopSpeed16Regular,
} from "@fluentui/react-icons";
import { getColorById } from "@lydie/core/colors";

type IconType = "assistant" | "linking" | "collaboration" | "search" | "speed";

type ColorId =
  | "coral"
  | "purple"
  | "blue"
  | "mint"
  | "gold"
  | "pink"
  | "periwinkle"
  | "green"
  | "peach"
  | "violet"
  | "cyan"
  | "rose";

interface FeatureIconProps {
  icon: IconType;
  color: ColorId;
}

interface FeatureBadgeProps extends FeatureIconProps {
  text: string;
}

const iconMap = {
  assistant: BotFilled,
  linking: LinkFilled,
  collaboration: PeopleFilled,
  search: SearchFilled,
  speed: TopSpeed16Regular,
};

// Feature slug to icon type mapping - used across marketing pages
export const featureSlugToIcon: Record<
  string,
  "assistant" | "linking" | "collaboration" | "search" | "speed"
> = {
  assistant: "assistant",
  linking: "linking",
  "collaborative-editing": "collaboration",
  search: "search",
  speed: "speed",
};

export function FeatureIcon({ icon, color }: FeatureIconProps) {
  const Icon = iconMap[icon];
  const colorValue = getColorById(color)?.value || "#9BB5D4";

  return (
    <div
      className="rounded-xl size-10 justify-center flex items-center border border-black/10 shadow-[0_1px_--theme(--color-white/0.15)_inset,0_1px_3px_--theme(--color-black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-t before:from-white/25 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative overflow-hidden"
      style={{ backgroundColor: colorValue }}
    >
      <div className="absolute border border-white/20 inset-0 rounded-xl" />
      <div className="absolute top-2 bg-linear-to-r h-px bg-white/7 inset-x-0" />
      <div className="absolute bottom-2 bg-linear-to-r h-px bg-white/7 inset-x-0" />
      <div className="absolute right-2 bg-linear-to-t w-px bg-white/7 inset-y-0" />
      <div className="absolute left-2 bg-linear-to-b w-px bg-white/7 inset-y-0" />
      <Icon className="text-white size-5 relative z-10" />
    </div>
  );
}

export function FeatureBadge({ icon, color, text }: FeatureBadgeProps) {
  const Icon = iconMap[icon];
  const colorValue = getColorById(color)?.value || "#9BB5D4";

  return (
    <div className="rounded-full p-0.5 ring ring-black/5 flex items-center gap-x-1.5 self-start pr-2.5 bg-white">
      <div
        className="rounded-full size-5 justify-center flex items-center border border-black/10 shadow-[0_1px_--theme(--color-white/0.15)_inset,0_1px_3px_--theme(--color-black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative"
        style={{ backgroundColor: colorValue }}
      >
        <Icon className="size-3 text-white" />
      </div>
      <span className="text-xs font-medium text-gray-900">{text}</span>
    </div>
  );
}
