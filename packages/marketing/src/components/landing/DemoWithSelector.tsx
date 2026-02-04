import { useState } from "react";

import { ComposableDemo, type DemoState } from "./ComposableDemo";
import { DemoStateSelector, DEFAULT_STATE_ORDER } from "./DemoStateSelector";

interface DemoWithSelectorProps {
  states?: DemoState[];
  initialState?: DemoState;
  showSelector?: boolean;
}

export function DemoWithSelector({
  states = DEFAULT_STATE_ORDER,
  initialState,
  showSelector = true,
}: DemoWithSelectorProps) {
  const [activeState, setActiveState] = useState<DemoState>(
    initialState ?? states[0]
  );

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {showSelector && (
        <DemoStateSelector
          states={states}
          activeState={activeState}
          onStateChange={setActiveState}
        />
      )}
      <ComposableDemo activeState={activeState} states={states} />
    </div>
  );
}

export { DEFAULT_STATE_ORDER };
export type { DemoState };
