interface Props {
  steps: string[]
}

export function HowToSection({ steps }: Props) {
  return (
    <div className="prose max-w-none">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">How to Convert</h2>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={index} className="text-gray-700">
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}
