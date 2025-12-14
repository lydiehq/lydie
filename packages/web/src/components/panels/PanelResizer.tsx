import { PanelResizeHandle } from "react-resizable-panels";
import { useFocusVisible } from "react-aria";

export function PanelResizer(props: any) {
  const { isFocusVisible } = useFocusVisible();
  return (
    <PanelResizeHandle
      {...props}
      className={`w-1 h-full relative group hover:bg-gray-100 transition-colors -ml-1 ${
        isFocusVisible ? "" : "focus:outline-none"
      }`}
    />
  );
}
