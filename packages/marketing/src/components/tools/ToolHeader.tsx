import { Heading } from "../generic/Heading"

export function ToolHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-y-2">
      <Heading>{title}</Heading>
      <p className="text-gray-600 text-sm/relaxed max-w-[65ch]">{description}</p>
    </div>
  )
}
