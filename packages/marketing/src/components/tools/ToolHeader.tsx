export function ToolHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-y-2">
      <h1 className="text-3xl font-medium text-black/85">{title}</h1>
      <p className="text-gray-600 text-sm/relaxed max-w-[65ch]">{description}</p>
    </div>
  );
}
