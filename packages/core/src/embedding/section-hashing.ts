import { generateContentHash } from "../hash";
import { serializeToPlainText } from "../serialization/text";

export interface Section {
  heading?: string;
  level?: number;
  content: any[];
  hash: string;
  startNodeIndex: number;
  endNodeIndex: number;
}

export interface SectionHashes {
  [sectionKey: string]: string;
}

interface CurrentSection {
  heading?: string;
  level?: number;
  content: any[];
  startNodeIndex: number;
}

export function extractSections(jsonContent: any): Section[] {
  if (!jsonContent?.content || !Array.isArray(jsonContent.content)) {
    console.warn("[extractSections] Invalid JSON content structure");
    return [];
  }

  const sections: Section[] = [];
  let currentSection: CurrentSection | null = null;

  const contentArray = jsonContent.content as any[];

  if (contentArray.length === 0) {
    console.warn("[extractSections] Document has no content nodes");
    return [];
  }

  const hasSectionHeadings = contentArray.some(
    (node: any) =>
      node.type === "heading" &&
      (node.attrs?.level === 1 || node.attrs?.level === 2)
  );

  if (!hasSectionHeadings) {
    const plaintext = contentArray
      .map((n: any) => serializeToPlainText(n))
      .join("\n");

    if (plaintext.trim().length > 0) {
      sections.push({
        heading: undefined,
        level: undefined,
        content: contentArray,
        hash: generateContentHash(plaintext),
        startNodeIndex: 0,
        endNodeIndex: contentArray.length - 1,
      });
    }
    return sections;
  }

  contentArray.forEach((node: any, index: number) => {
    const isHeading = node.type === "heading";
    const isSectionHeading =
      isHeading && (node.attrs?.level === 1 || node.attrs?.level === 2);

    if (isSectionHeading) {
      if (currentSection) {
        const plaintext = currentSection.content
          .map((n: any) => serializeToPlainText(n))
          .join("\n");

        if (plaintext.trim().length > 0) {
          sections.push({
            heading: currentSection.heading,
            level: currentSection.level,
            content: currentSection.content,
            hash: generateContentHash(plaintext),
            startNodeIndex: currentSection.startNodeIndex,
            endNodeIndex: index - 1,
          });
        }
      }

      const headingText = serializeToPlainText(node);
      currentSection = {
        heading: headingText,
        level: node.attrs?.level || 1,
        content: [node],
        startNodeIndex: index,
      };
    } else {
      if (!currentSection) {
        currentSection = {
          heading: undefined,
          level: undefined,
          content: [],
          startNodeIndex: 0,
        };
      }
      currentSection.content.push(node);
    }
  });

  if (currentSection !== null) {
    const section: CurrentSection = currentSection;
    if (section.content.length > 0) {
      const plaintext = section.content
        .map((n: any) => serializeToPlainText(n))
        .join("\n");

      if (plaintext.trim().length > 0) {
        sections.push({
          heading: section.heading,
          level: section.level,
          content: section.content,
          hash: generateContentHash(plaintext),
          startNodeIndex: section.startNodeIndex,
          endNodeIndex: (jsonContent.content as any[]).length - 1,
        });
      }
    }
  }

  return sections;
}

export function sectionsToHashMap(sections: Section[]): SectionHashes {
  const hashMap: SectionHashes = {};

  sections.forEach((section, index) => {
    const key = section.heading || `__intro_${index}`;
    hashMap[key] = section.hash;
  });

  return hashMap;
}

export function findChangedSections(
  oldHashes: SectionHashes | null,
  newSections: Section[]
): {
  changedSections: Section[];
  unchangedSectionKeys: string[];
  isFullReindex: boolean;
} {
  if (!oldHashes || Object.keys(oldHashes).length === 0) {
    return {
      changedSections: newSections,
      unchangedSectionKeys: [],
      isFullReindex: true,
    };
  }

  const changedSections: Section[] = [];
  const unchangedSectionKeys: string[] = [];

  newSections.forEach((section, index) => {
    const key = section.heading || `__intro_${index}`;
    const oldHash = oldHashes[key];

    if (!oldHash || oldHash !== section.hash) {
      changedSections.push(section);
    } else {
      unchangedSectionKeys.push(key);
    }
  });

  const newKeys = newSections.map((s, i) => s.heading || `__intro_${i}`);
  const deletedSections = Object.keys(oldHashes).filter(
    (key) => !newKeys.includes(key)
  );

  const hasStructuralChanges = deletedSections.length > 0;

  return {
    changedSections,
    unchangedSectionKeys,
    isFullReindex: hasStructuralChanges,
  };
}

export function sectionToJsonDoc(section: Section): any {
  return {
    type: "doc",
    content: section.content,
  };
}
