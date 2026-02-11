import { useState } from "react";

import { ComposableDemo, type DemoState } from "./ComposableDemo";
import { DemoStateSelector, DEFAULT_STATE_ORDER } from "./DemoStateSelector";

type Props = {
  states?: DemoState[];
  initialState?: DemoState;
  showSelector?: boolean;
  children?: React.ReactNode;
};

export function DemoWithSelector({ states = DEFAULT_STATE_ORDER, initialState, children }: Props) {
  const [activeState, setActiveState] = useState<DemoState>(initialState ?? states[0]);

  return (
    <div className="flex-col lg:items-center gap-y-6 w-full flex">
      <div className="flex flex-col lg:flex-row justify-between lg:items-end w-full gap-y-4 lg:gap-y-0">
        <div>{children}</div>
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
