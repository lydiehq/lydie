import clsx from "clsx";

import { DotsVerticalRegular } from "../icons/mingcute";

type Props = {
  // The block's short type (a heading's "H2"), shown in place of the grip until the pointer is
  // on the handle, so the gutter holds one thing at a time.
  label?: string;
};

// The block drag handle from v1's Editor.tsx.
export function DragHandleGrip({ label }: Props) {
  return (
    <div className="group/handle flex min-w-4 cursor-grab items-center justify-end rounded text-gray-400 hover:text-gray-600 active:cursor-grabbing">
      {label && (
        <span
          className="font-mono text-xs font-medium group-hover/handle:hidden"
          aria-hidden="true"
        >
          {label}
        </span>
      )}
      {/* MingCute's "dots-vertical" is three columns of two; turned, it is the usual 2 × 3 grip. */}
      <DotsVerticalRegular
        className={clsx("rotate-90", label ? "hidden size-4 group-hover/handle:block" : "size-4")}
        aria-hidden="true"
      />
    </div>
  );
}
