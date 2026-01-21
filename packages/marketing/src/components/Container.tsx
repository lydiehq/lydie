import { twMerge } from "tailwind-merge"

type Props = {
  children: React.ReactNode
  className?: string
}

export function Container({ children, className }: Props) {
  return <div className={twMerge("max-w-5xl mx-auto lg:px-0 px-4 w-full", className)}>{children}</div>
}
