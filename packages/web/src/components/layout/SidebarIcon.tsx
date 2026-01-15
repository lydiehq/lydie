type SidebarIconProps = {
  direction?: "left" | "right";
  collapsed?: boolean;
};

export function SidebarIcon({
  direction = "left",
  collapsed = false,
}: SidebarIconProps) {
  return (
    <div className="size-[15px] border border-black/10 group-hover:bg-black/30 transition-color duration-150 bg-black/24 shadow-inner rounded-[3px] relative">
      <div
        className={`absolute group-hover:w-[4px] w-[7px] bg-surface rounded-[2px] inset-y-px transition-all duration-150 ease-in-out ${
          direction === "left" ? "left-px" : "right-px"
        } shadow-xs`}
      />
    </div>
  );
}
