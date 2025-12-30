export interface Feature {
  id: string;
  title: string;
  description: string;
  href: string;
}

export const features: Feature[] = [
  {
    id: "real-time-collaboration",
    title: "Real-time collaboration",
    description:
      "Work on the same document at the same time — without version conflicts or duplicated files. Edit documents together, see changes instantly, and collaborate naturally.",
    href: "/features/real-time-collaboration",
  },
];

export function getFeature(id: string): Feature | undefined {
  return features.find((feature) => feature.id === id);
}
