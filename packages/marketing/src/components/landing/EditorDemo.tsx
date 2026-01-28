import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { EditorShell } from "@lydie/ui/components/editor/EditorShell";

const sampleContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Product Roadmap Q1 2026" }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Overview" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This quarter we're focusing on enhancing our core ",
        },
        { type: "text", marks: [{ type: "bold" }], text: "platform capabilities" },
        {
          type: "text",
          text: " and expanding integrations with key tools your team already uses.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Our primary objectives include improving performance, adding new ",
        },
        { type: "text", marks: [{ type: "bold" }], text: "collaboration features" },
        {
          type: "text",
          text: ", and building out our API ecosystem to support more custom workflows.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Key Features" }],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Real-time Collaboration",
                },
                {
                  type: "text",
                  text: " - Work together seamlessly with live cursors and presence indicators",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Advanced Search",
                },
                {
                  type: "text",
                  text: " - Find information instantly across all your documents with AI-powered search",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Custom Fields",
                },
                {
                  type: "text",
                  text: " - Add structured metadata to organize and track your content",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Timeline" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "We're also investing heavily in AI-powered features that will help teams work more efficiently and make better decisions faster.",
        },
      ],
    },
  ],
};

export function EditorDemo() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: sampleContent,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none editor-content",
      },
    },
  });

  const toolbar = (
    <div className="flex justify-between items-center px-1 py-0.5 border-b border-gray-200">
      <div className="flex items-center gap-1">
        <ToolbarButton title="Bold">
          <BoldIcon />
        </ToolbarButton>
        <ToolbarButton title="Italic">
          <ItalicIcon />
        </ToolbarButton>
        <ToolbarButton title="Strikethrough">
          <StrikethroughIcon />
        </ToolbarButton>
        <ToolbarButton title="Code">
          <CodeIcon />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-200"></div>

        <ToolbarButton title="Heading 1">
          <H1Icon />
        </ToolbarButton>
        <ToolbarButton title="Heading 2">
          <H2Icon />
        </ToolbarButton>
        <ToolbarButton title="Heading 3">
          <H3Icon />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-200"></div>

        <ToolbarButton title="Bullet List">
          <BulletListIcon />
        </ToolbarButton>
        <ToolbarButton title="Ordered List">
          <OrderedListIcon />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-200"></div>

        <ToolbarButton title="Add Link">
          <LinkIcon />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-200"></div>

        <ToolbarButton title="Insert Image">
          <ImageIcon />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-200"></div>

        <ToolbarButton title="Insert Table">
          <TableIcon />
        </ToolbarButton>
      </div>

      <div className="flex gap-x-1 items-center">
        <button className="p-1.5 rounded hover:bg-gray-100" aria-label="More options">
          <svg
            className="size-3.5 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="5" r="1.5" fill="currentColor"></circle>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
            <circle cx="12" cy="19" r="1.5" fill="currentColor"></circle>
          </svg>
        </button>
        <button className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
          Publish
        </button>
        <div className="mx-1 h-6 w-px bg-gray-200"></div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-surface ring ring-black/10 h-[600px]">
      <EditorShell toolbar={toolbar}>
        <EditorContent editor={editor} className="editor-content" />
      </EditorShell>
    </div>
  );
}

// Toolbar Button Component
function ToolbarButton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <button className="p-1 rounded hover:bg-gray-100 text-gray-700" title={title}>
      {children}
    </button>
  );
}

// Icon Components
function BoldIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"
      ></path>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"
      ></path>
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line
        x1="19"
        y1="4"
        x2="10"
        y2="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></line>
      <line
        x1="14"
        y1="20"
        x2="5"
        y2="20"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></line>
      <line
        x1="15"
        y1="4"
        x2="9"
        y2="20"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></line>
    </svg>
  );
}

function StrikethroughIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h16M6 6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v1M6 18c0 1.1.9 2 2 2h8c1.1 0 2 .9 2 2v-1"
      ></path>
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <polyline
        points="16 18 22 12 16 6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></polyline>
      <polyline
        points="8 6 2 12 8 18"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></polyline>
    </svg>
  );
}

function H1Icon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h8m-8-6v12m8-12v12m5-12v12m0-6h3"
      ></path>
    </svg>
  );
}

function H2Icon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h8m-8-6v12m8-12v12m5 4h5l-5-6h5"
      ></path>
    </svg>
  );
}

function H3Icon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M4 12h8m-8-6v12m8-12v12m6 0h4a2 2 0 0 0 0-4h-4m0 4h4a2 2 0 0 0 0-4"
      ></path>
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" strokeWidth="2"></line>
      <circle cx="3.5" cy="6" r="1" fill="currentColor"></circle>
      <circle cx="3.5" cy="12" r="1" fill="currentColor"></circle>
      <circle cx="3.5" cy="18" r="1" fill="currentColor"></circle>
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="10" y1="6" x2="21" y2="6" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="10" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth="2"></line>
      <line x1="10" y1="18" x2="21" y2="18" strokeLinecap="round" strokeWidth="2"></line>
      <path
        d="M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></path>
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
      ></path>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
      ></path>
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle>
      <polyline
        points="21 15 16 10 5 21"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      ></polyline>
    </svg>
  );
}

function TableIcon() {
  return (
    <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9" strokeWidth="2"></line>
      <line x1="3" y1="15" x2="21" y2="15" strokeWidth="2"></line>
      <line x1="12" y1="3" x2="12" y2="21" strokeWidth="2"></line>
    </svg>
  );
}
