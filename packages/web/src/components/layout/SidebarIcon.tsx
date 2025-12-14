type SidebarIconProps = {
  direction?: "left" | "right";
  collapsed?: boolean;
};

export function SidebarIcon({
  direction = "left",
  collapsed = false,
}: SidebarIconProps) {
  const baseWidth = collapsed ? "w-[3px]" : "w-[4px]";
  const hoverWidth = collapsed ? "group-hover:w-[4px]" : "group-hover:w-[3px]";

  return (
    <div className="size-[14px] border-[1.5px] border-gray-400 rounded-[3px] relative">
      <div
        className={`absolute ${baseWidth} ${hoverWidth} bg-gray-400 rounded-[1px] inset-y-px transition-all duration-150 ease-in-out ${
          direction === "left" ? "left-px" : "right-px"
        }`}
      />
    </div>
  );
}
