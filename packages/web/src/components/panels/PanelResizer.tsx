import { Separator } from "react-resizable-panels";

export function PanelResizer() {
  return (
    <Separator className="group w-1 h-full relative">
      <div className="h-2 w-0.5 rounded-full bg-black/10 z-20 absolute top-1/2 -translate-y-1/2 -right-2.5 -translate-x-1 group-data-[separator=hover]:h-4 group-data-[separator=active]:h-8 group-data-[separator=hover]:translate-x-0 group-data-[separator=active]:translate-x-0 transition-all duration-150 group-data-[separator=hover]:opacity-100 group-data-[separator=active]:opacity-100 opacity-0" />
    </Separator>
  );
}
