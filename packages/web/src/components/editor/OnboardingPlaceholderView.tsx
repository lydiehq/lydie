import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function OnboardingPlaceholderView({ node }: NodeViewProps) {
  const title = node.attrs.title || "Coming Soon";
  const description = node.attrs.description || "This onboarding step will be available soon.";

  return (
    <NodeViewWrapper>
      <div className="editor-content-reset rounded-xl p-6 flex flex-col gap-y-3 bg-linear-to-br from-gray-50 to-gray-100 border border-gray-200 shadow-sm my-6">
        <span className="text-lg font-semibold text-gray-900">{title}</span>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </NodeViewWrapper>
  );
}
