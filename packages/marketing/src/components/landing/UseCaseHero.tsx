import { useState } from "react";

import { Heading } from "../generic/Heading";
import { ComposableDemo, type DemoState } from "./ComposableDemo";
import { DemoStateSelector, DEFAULT_STATE_ORDER } from "./DemoStateSelector";

type Props = {
  states?: DemoState[];
  initialState?: DemoState;
  showSelector?: boolean;
  title: string;
  description: string;
};

export function UseCaseHero({
  states = DEFAULT_STATE_ORDER,
  initialState,
  title,
  description,
}: Props) {
  const [activeState, setActiveState] = useState<DemoState>(initialState ?? states[0]);

  return (
    <div className="flex-col lg:items-center gap-y-8 w-full flex">
      <div className="flex flex-col w-full gap-y-8 items-start">
        <div className="flex flex-col max-w-[65ch] gap-y-6">
          <Heading level={1} className="text-4xl">
            {title}
          </Heading>
          <p className="text-base/relaxed text-gray-600 leading-relaxed">{description}</p>
        </div>

        <DemoStateSelector
          states={states}
          activeState={activeState}
          onStateChange={setActiveState}
        />
      </div>
      <ComposableDemo activeState={activeState} states={states} />
    </div>
  );
}

export { DEFAULT_STATE_ORDER };
export type { DemoState };
