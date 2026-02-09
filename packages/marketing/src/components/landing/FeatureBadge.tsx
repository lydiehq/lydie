import {
  BotFilled,
  LinkFilled,
  PeopleFilled,
  SearchFilled,
  TopSpeed16Regular,
} from "@fluentui/react-icons";

import { GradientOutline } from "../generic/GradientOutline";

type Props = {
  feature: string;
};

const features = {
  assistant: {
    icon: BotFilled,
    color: "bg-blue-400",
    text: "AI Assistant",
  },
  search: {
    icon: SearchFilled,
    color: "bg-green-400",
    text: "Search",
  },
  linking: {
    icon: LinkFilled,
    color: "bg-purple-400",
    text: "Linking",
  },
  collaboration: {
    icon: PeopleFilled,
    color: "bg-red-400",
    text: "Collaboration",
  },
  speed: {
    icon: TopSpeed16Regular,
    color: "bg-yellow-400",
    text: "Speed",
  },
};

export function FeatureBadge({ feature }: Props) {
  const { icon: Icon, color, text } = features[feature as keyof typeof features];
  return (
    <div className="rounded-full p-0.5 ring ring-black/5 flex items-center gap-x-1.5 self-start pr-2.5 bg-white">
      <div
        className={`rounded-full ${color} size-5 justify-center flex items-center border border-black/10 shadow-[0_1px_--theme(--color-white/0.15)_inset,0_1px_3px_--theme(--color-black/0.15)] before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-t before:from-white/15 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:bg-linear-to-b after:from-white/14 relative`}
      >
        <Icon className="size-3 text-white" />
      </div>
      <span className="text-xs font-medium text-gray-900">{text}</span>
    </div>
  );
}
