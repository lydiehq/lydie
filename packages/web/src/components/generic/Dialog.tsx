import { type DialogProps, Dialog as RACDialog } from "react-aria-components"
import { twMerge } from "tailwind-merge"

export function Dialog(props: DialogProps) {
  return <RACDialog {...props} className={twMerge("outline-0 max-h-[inherit] relative", props.className)} />
}
