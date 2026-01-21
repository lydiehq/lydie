type Props = { children: React.ReactNode }

export function Eyebrow({ children }: Props) {
  return <div className="text-[0.8125rem] font-medium text-gray-500">{children}</div>
}
