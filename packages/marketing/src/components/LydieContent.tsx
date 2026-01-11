import React from "react";
import {
  LydieContent as LydieContentComponent,
  type CustomBlockProps,
} from "@lydie-app/sdk/react";
import type { ContentNode } from "@lydie-app/sdk";

interface LydieContentProps {
  content: ContentNode;
  customComponents?: Record<string, React.ComponentType<CustomBlockProps>>;
  linkPrefix?: string;
  linkResolver?: (ref: {
    href: string;
    id?: string;
    slug?: string;
    title?: string;
    type?: "internal" | "external";
  }) => string;
}

export function LydieContent({
  content,
  customComponents = {},
  linkPrefix,
  linkResolver,
}: LydieContentProps) {
  return (
    <div>
      <LydieContentComponent
        content={content}
        components={customComponents}
        linkPrefix={linkPrefix}
        linkResolver={linkResolver}
      />
    </div>
  );
}
