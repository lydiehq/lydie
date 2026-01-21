import { cva } from "cva"
import { twMerge } from "tailwind-merge"

export const cardStyles = cva({
  base: "bg-white ring ring-black/6 rounded-lg",
  variants: {},
})

type Props = {
  children?: React.ReactNode
  className?: string
}

export function Card({ children, className }: Props) {
  return <div className={twMerge(cardStyles({ className }))}>{children}</div>
}
