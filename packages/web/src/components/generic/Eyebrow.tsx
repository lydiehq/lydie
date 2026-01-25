type Props = {
  children: React.ReactNode;
  className?: string;
};

export function Eyebrow({ children, className }: Props) {
  return <span className={`text-xs font-medium text-gray-500 ${className || ""}`}>{children}</span>;
}
