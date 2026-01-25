import { conversionConfigs } from "../../data/conversions";

interface Props {
  slugs: string[];
}

export function RelatedConverters({ slugs }: Props) {
  const relatedConfigs = slugs
    .map((slug) => conversionConfigs.find((c) => c.slug === slug))
    .filter(Boolean);

  if (relatedConfigs.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900">Related Converters</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {relatedConfigs.map((config) => (
          <a
            key={config!.slug}
            href={`/tools/convert/${config!.slug}`}
            className="block p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all"
          >
            <h3 className="font-semibold text-gray-900 mb-1">{config!.h1}</h3>
            <p className="text-sm text-gray-600">{config!.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
