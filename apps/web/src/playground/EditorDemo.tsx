import {
  blockTypeActions,
  defaultSlashItems,
  getActiveBlockType,
  LydieEditor,
  markActions,
  setLinkHref,
  useEditorState,
} from "@lydie/editor";
import type { Editor, JSONContent, SlashCommandItem, WikiLinkSuggestion } from "@lydie/editor";
import {
  BoldRegular,
  BulbRegular,
  Button,
  CodeLanguagePicker,
  CodeRegular,
  CommandList,
  DocumentThumbnailIcon,
  DragHandleGrip,
  EditorBubbleToolbar,
  EditorToolbar,
  FormulaRegular,
  Heading1Regular,
  Heading2Regular,
  Heading3Regular,
  Home2Regular,
  ItalicRegular,
  LinkField,
  LinkRegular,
  ListCheck2Regular,
  ListCheckRegular,
  ListOrderedRegular,
  MarkPenRegular,
  MinimizeRegular,
  More2Regular,
  PicRegular,
  QuoteLeftRegular,
  Search2Regular,
  sidebarItemStyles,
  StrikethroughRegular,
  TableHandleMenu,
  TableRegular,
} from "@lydie/ui";
import type { EditorToolbarItem } from "@lydie/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { sampleContent } from "./sample-content";

const ICONS: Record<string, ReactNode> = {
  paragraph: <span className="text-xs font-semibold">T</span>,
  heading1: <Heading1Regular />,
  heading2: <Heading2Regular />,
  heading3: <Heading3Regular />,
  bulletList: <ListCheckRegular />,
  orderedList: <ListOrderedRegular />,
  taskList: <ListCheck2Regular />,
  blockquote: <QuoteLeftRegular />,
  callout: <BulbRegular />,
  codeBlock: <CodeRegular />,
  mathBlock: <FormulaRegular />,
  table: <TableRegular />,
  horizontalRule: <MinimizeRegular />,
};

const MARK_ICONS: Record<string, ReactNode> = {
  bold: <BoldRegular />,
  italic: <ItalicRegular />,
  strike: <StrikethroughRegular />,
  code: <CodeRegular />,
  highlight: <MarkPenRegular />,
};

const slashItems: SlashCommandItem[] = defaultSlashItems.map((item) => ({
  ...item,
  icon: ICONS[item.id],
}));

const DOCUMENTS = [
  "Use cases",
  "Blog",
  "Technical writing",
  "Outline",
  "Diátaxis",
  "Writing with AI",
  "Knowledge bases",
  "What is Markdown?",
];

// Stands in for the host's search; the editor only ever calls this.
async function searchDocuments(query: string): Promise<WikiLinkSuggestion[]> {
  const q = query.toLowerCase();
  return DOCUMENTS.filter((title) => title.toLowerCase().includes(q)).map((title) => ({
    target: title,
  }));
}

// Mount components that use this only once the editor exists: TipTap's useEditorState keeps its
// first snapshot when the editor changes from null until the next transaction.
function useFormattingState(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            marks: Object.fromEntries(markActions.map((a) => [a.id, a.isActive(current)])),
            blockType: getActiveBlockType(current).id,
            blockquote: current.isActive("blockquote"),
            bulletList: current.isActive("bulletList"),
            orderedList: current.isActive("orderedList"),
            link: current.isActive("link"),
            table: current.isActive("table"),
            heading: [1, 2, 3].map((level) => current.isActive("heading", { level })),
            empty: current.state.selection.empty,
            characters: current.storage.characterCount.characters(),
            words: current.storage.characterCount.words(),
          }
        : null,
  });
}

type BubbleProps = {
  editor: Editor;
  editingLink: boolean;
  setEditingLink: (value: boolean) => void;
};

function BubbleMenuContent({ editor, editingLink, setEditingLink }: BubbleProps) {
  const state = useFormattingState(editor);
  if (!state) return null;

  const items: EditorToolbarItem[] = [
    ...markActions
      .filter((action) => action.id !== "highlight")
      .map((action) => ({
        id: action.id,
        label: action.label,
        icon: MARK_ICONS[action.id],
        isActive: state.marks[action.id],
        onPress: () => action.run(editor),
      })),
    {
      id: "blockquote",
      label: "Blockquote",
      icon: <QuoteLeftRegular />,
      isActive: state.blockquote,
      onPress: () => editor.chain().focus().toggleBlockquote().run(),
    },
    "separator",
    {
      id: "link",
      label: "Add Link",
      icon: <LinkRegular />,
      hotkeys: ["⌘", "K"],
      isActive: state.link,
      isDisabled: state.empty,
      onPress: () => setEditingLink(true),
    },
  ];

  return (
    <EditorBubbleToolbar
      className="playground-bubble"
      items={items}
      blockTypes={blockTypeActions.map(({ id, label }) => ({ id, label }))}
      activeBlockType={state.blockType}
      onBlockTypeChange={(id) => blockTypeActions.find((a) => a.id === id)?.run(editor)}
    >
      {editingLink ? (
        <LinkField
          defaultValue={(editor.getAttributes("link").href as string | undefined) ?? ""}
          onSubmit={(href) => {
            setLinkHref(editor, href);
            setEditingLink(false);
          }}
          onRemove={
            state.link
              ? () => {
                  setLinkHref(editor, "");
                  setEditingLink(false);
                }
              : undefined
          }
          onCancel={() => {
            setEditingLink(false);
            editor.commands.focus();
          }}
        />
      ) : undefined}
    </EditorBubbleToolbar>
  );
}

function TopToolbar({ editor }: { editor: Editor }) {
  const state = useFormattingState(editor);
  if (!state) return null;
  const chain = () => editor.chain().focus();
  const items: EditorToolbarItem[] = [
    ...markActions.map((action) => ({
      id: action.id,
      label: action.label,
      icon: MARK_ICONS[action.id],
      isActive: state.marks[action.id],
      onPress: () => action.run(editor),
    })),
    "separator",
    ...([1, 2, 3] as const).map((level) => ({
      id: `h${level}`,
      label: `Heading ${level}`,
      icon: [<Heading1Regular key={1} />, <Heading2Regular key={2} />, <Heading3Regular key={3} />][
        level - 1
      ],
      isActive: state.heading[level - 1],
      onPress: () => chain().toggleHeading({ level }).run(),
    })),
    "separator",
    {
      id: "bullet",
      label: "Bullet List",
      icon: <ListCheckRegular />,
      isActive: state.bulletList,
      onPress: () => chain().toggleBulletList().run(),
    },
    {
      id: "ordered",
      label: "Ordered List",
      icon: <ListOrderedRegular />,
      isActive: state.orderedList,
      onPress: () => chain().toggleOrderedList().run(),
    },
    "separator",
    {
      id: "link",
      label: "Link",
      icon: <LinkRegular />,
      isActive: state.link,
      isDisabled: state.empty && !state.link,
      onPress: () => editor.commands.openLinkEditor(),
    },
    "separator",
    {
      id: "image",
      label: "Image",
      icon: <PicRegular />,
      onPress: () =>
        chain().setImage({ src: "https://placehold.co/600x200/png", alt: "Placeholder" }).run(),
    },
    "separator",
    {
      id: "table",
      label: "Table",
      icon: <TableRegular />,
      isActive: state.table,
      onPress: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
  ];
  return (
    <EditorToolbar
      items={items}
      end={
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Document options">
            <More2Regular className="size-3.5 text-gray-600" />
          </Button>
          <Button variant="secondary" size="sm">
            Publish
          </Button>
        </div>
      }
    />
  );
}

function Sidebar() {
  return (
    <div className="flex w-[260px] shrink-0 flex-col gap-3 border-r border-gray-950/5 bg-surface">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="flex size-5 items-center justify-center rounded-md bg-gray-900 text-[11px] font-semibold text-surface">
          L
        </div>
        <span className="text-sm font-medium text-gray-900">Lydie</span>
      </div>
      <div className="flex gap-x-1 px-3">
        <Button variant="secondary" size="md" className="grow">
          Quick Action
        </Button>
        <Button variant="secondary" size="icon-md" aria-label="Search">
          <Search2Regular className="size-4" />
        </Button>
      </div>
      <div className="flex flex-col px-2">
        <div className={sidebarItemStyles({ className: "gap-2 px-2" })}>
          <Home2Regular className="icon-muted size-4" />
          Home
        </div>
      </div>
      <div className="px-4 text-xs font-medium text-gray-500">Documents</div>
      <div className="px-2">
        {DOCUMENTS.map((title) => (
          <div
            key={title}
            className={sidebarItemStyles({
              isCurrent: title === "Diátaxis",
              className: "gap-2.5 px-2",
            })}
          >
            <DocumentThumbnailIcon size="sm" />
            <span className="truncate">{title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Counts({ editor }: { editor: Editor }) {
  const state = useFormattingState(editor);
  return (
    <span className="flex gap-4">
      <span>Characters: {state?.characters ?? 0}</span>
      <span>Words: {state?.words ?? 0}</span>
    </span>
  );
}

export function EditorDemo() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editingLink, setEditingLink] = useState(false);
  const [content, setContent] = useState<JSONContent>(sampleContent);
  const blockCount = content.content?.length ?? 0;
  // `?full` drops the fixed frame height so a screenshot can show the whole document.
  const [full] = useState(() => new URLSearchParams(window.location.search).has("full"));

  return (
    <div
      className={`flex overflow-hidden rounded-xl bg-surface shadow-container ${full ? "" : "h-[860px]"}`}
    >
      <Sidebar />
      <div className="flex min-w-0 grow flex-col">
        {editor ? (
          <TopToolbar editor={editor} />
        ) : (
          <div className="h-[37px] shrink-0 border-b border-gray-200" />
        )}
        <div className="flex grow overflow-y-auto scrollbar scrollbar-thumb-gray-200 scrollbar-track-white">
          <div className="mx-auto flex w-full shrink-0 grow flex-col pt-12">
            <div className="mx-auto w-full max-w-[680px] px-4">
              <h1 className="my-2 py-4 text-[1.75rem] leading-[calc(2/1.75)] font-medium tracking-[-0.05rem] text-gray-950">
                The Diátaxis Framework: How to Structure Technical Documentation
              </h1>
            </div>
            <LydieEditor
              aria-label="Document content"
              content={content}
              onUpdate={setContent}
              onCreate={setEditor}
              placeholder="Write something, or press / for commands"
              slashItems={slashItems}
              renderSlashMenu={(menu) => <CommandList aria-label="Insert block" {...menu} />}
              searchDocuments={searchDocuments}
              renderWikiLinkMenu={(menu) => (
                <CommandList
                  aria-label="Link to document"
                  emptyLabel="No matching documents"
                  {...menu}
                  items={menu.items.map((item) => ({
                    id: item.target,
                    title: item.title ?? item.target,
                    icon: <DocumentThumbnailIcon size="sm" />,
                  }))}
                />
              )}
              onOpenLink={() => setEditingLink(true)}
              bubbleMenu={(current) => (
                <BubbleMenuContent
                  editor={current}
                  editingLink={editingLink}
                  setEditingLink={setEditingLink}
                />
              )}
              dragHandle={(block) => <DragHandleGrip label={block?.label} />}
              renderTableHandle={(handle) => <TableHandleMenu {...handle} />}
              renderCodeLanguagePicker={(picker) => <CodeLanguagePicker {...picker} />}
              className="grow"
            />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-1.5 text-xs text-gray-400">
          <span>{blockCount} top-level blocks</span>
          {editor && <Counts editor={editor} />}
        </div>
      </div>
    </div>
  );
}
