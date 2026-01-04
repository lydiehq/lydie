import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";

export function CodeBlockComponent({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const defaultLanguage = node.attrs?.language || "null";

  // Get the CodeBlock extension from the editor
  const codeBlockExtension = editor.extensionManager.extensions.find(
    (ext) => ext.name === "codeBlock"
  );
  const lowlight = codeBlockExtension?.options.lowlight;

  return (
    <NodeViewWrapper className="relative my-4 group">
      <div className="flex items-center justify-between mb-1">
        <select
          contentEditable={false}
          defaultValue={defaultLanguage}
          onChange={(event) =>
            updateAttributes({ language: event.target.value })
          }
          className="text-xs text-gray-500 dark:text-gray-400 bg-transparent border-0 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 transition-colors appearance-none pr-6 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3E%3Cpath stroke=%27%236b7280%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3E%3C/svg%3E')] bg-no-repeat bg-right"
          style={{
            backgroundPosition: "right 0.25rem center",
          }}
        >
          <option value="null">auto</option>
          <option disabled>—</option>
          {lowlight?.listLanguages().map((lang: string, index: number) => (
            <option key={index} value={lang}>
              {lang}
            </option>
          ))}
        </select>
      </div>
      <pre className="relative overflow-x-auto rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 my-0">
        <code className="font-mono text-sm leading-relaxed text-gray-900 dark:text-gray-100">
          <NodeViewContent />
        </code>
      </pre>
    </NodeViewWrapper>
  );
}
