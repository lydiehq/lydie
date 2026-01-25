import { useFocusVisible } from "react-aria";
import { Separator } from "react-resizable-panels";

export function PanelResizer(props: any) {
  const { isFocusVisible } = useFocusVisible();
  return (
    <Separator
      {...props}
      className={`w-1 h-full relative group hover:bg-gray-100 transition-colors -ml-1 ${
        isFocusVisible ? "" : "focus:outline-none"
      }`}
    />
  );
}
