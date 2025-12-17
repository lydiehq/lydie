import { Heading } from "../generic/Heading";

export function SettingsSectionLayout({
  heading,
  description,
  headingLevel = 2,
}: {
  heading: string;
  description?: string;
  headingLevel?: 1 | 2 | 3 | 4;
}) {
  return (
    <div className="flex flex-col gap-y-2">
      <Heading level={headingLevel}>{heading}</Heading>
      {description && (
        <p className="text-sm/relaxed text-gray-700">{description}</p>
      )}
    </div>
  );
}
