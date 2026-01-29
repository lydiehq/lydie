import {
  DocumentRegular,
  LinkRegular,
  PeopleTeamRegular,
  FormNewRegular,
} from "@fluentui/react-icons";
import { CollaborationCaret } from "@lydie/ui/components/editor/CollaborationCaret.tsx";
import { MetadataTabsShell } from "@lydie/ui/components/editor/MetadataTabsShell.tsx";
import {
  BoldIcon,
  CodeIcon,
  H1Icon,
  H2Icon,
  H3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  TableIcon,
} from "@lydie/ui/components/icons/wysiwyg-icons.tsx";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TabPanel } from "react-aria-components";

import { Eyebrow } from "./Eyebrow";

type FeatureType = "collaboration" | "fields" | "linking" | null;

type ToolbarItem =
  | { type: "button"; title: string; Icon: React.ComponentType<{ className?: string }> }
  | { type: "separator" };

const TOOLBAR_ITEMS: ToolbarItem[] = [
  { type: "button", title: "Bold", Icon: BoldIcon },
  { type: "button", title: "Italic", Icon: ItalicIcon },
  { type: "button", title: "Strikethrough", Icon: StrikethroughIcon },
  { type: "button", title: "Code", Icon: CodeIcon },
  { type: "separator" },
  { type: "button", title: "Heading 1", Icon: H1Icon },
  { type: "button", title: "Heading 2", Icon: H2Icon },
  { type: "button", title: "Heading 3", Icon: H3Icon },
  { type: "separator" },
  { type: "button", title: "Bullet List", Icon: BulletListIcon },
  { type: "button", title: "Ordered List", Icon: OrderedListIcon },
  { type: "separator" },
  { type: "button", title: "Add Link", Icon: LinkIcon },
  { type: "separator" },
  { type: "button", title: "Insert Image", Icon: ImageIcon },
  { type: "separator" },
  { type: "button", title: "Insert Table", Icon: TableIcon },
];

const FEATURES: {
  id: Exclude<FeatureType, null>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "collaboration", label: "Collaboration", icon: PeopleTeamRegular },
  { id: "fields", label: "Custom Fields", icon: FormNewRegular },
  { id: "linking", label: "Internal Linking", icon: LinkRegular },
];

const collaborators = [
  { name: "Sarah", color: "#30bced" },
  { name: "Alex", color: "#6eeb83" },
  { name: "Jordan", color: "#ffbc42" },
];

export function InteractiveEditorDemo() {
  const [activeFeature, setActiveFeature] = useState<FeatureType>("collaboration");

  const showCollaboration = activeFeature === "collaboration";

  return (
    <section className="flex flex-col items-center py-8 pb-36 overflow-visible">
      <div className="flex flex-col gap-y-2 col-span-1 w-2xl items-center text-center">
        <Eyebrow>Best-in-class editor</Eyebrow>
        <h2 className="text-3xl font-medium text-gray-900">Experience the delight of writing</h2>
        <p className="text-base/relaxed text-gray-600 max-w-sm text-balance">
          Lydie's editor is built with the latest technology to provide you with the best editing
          experience.
        </p>
      </div>

      <div className="h-[580px] w-full max-w-4xl mt-16 relative long-shadow">
        {/* Shadow layer */}
        <div className="absolute inset-0" style={{ filter: "blur(3px)" }}>
          <div className="long-shadow-layer" />
        </div>

        {/* Content layer */}
        <div className="long-shadow-content flex flex-col ring ring-black/8 rounded-2xl overflow-hidden bg-white p-2">
          <div className="flex ring ring-black/8 rounded-xl relative z-10 flex-col size-full">
            <FeatureButtons
              features={FEATURES}
              activeFeature={activeFeature}
              onFeatureChange={setActiveFeature}
            />
            <div className="flex justify-between items-center px-1 py-0.5 border-b border-gray-200">
              <div className="flex items-center gap-1">
                {TOOLBAR_ITEMS.map((item, i) =>
                  item.type === "separator" ? (
                    <div key={i} className="mx-1 h-6 w-px bg-gray-200" />
                  ) : (
                    <ToolbarButton key={item.title} title={item.title}>
                      <item.Icon className="size-3.5" />
                    </ToolbarButton>
                  ),
                )}
              </div>

              {/* {activeFeature === "collaboration" && <CollaborationPresence />} */}
            </div>

            <div className="px-8 py-6 max-w-[65ch] mx-auto overflow-hidden grow">
              <h1 className="text-[1.75rem] font-medium text-gray-900 mt-0 mb-4 select-none">
                Ideas for the cabin trip
              </h1>

              <CustomFields isExpanded={activeFeature === "fields"} />
              <div className="prose prose-sm editor-content ">
                <p className="text-gray-700 leading-relaxed mb-4">
                  We're heading up{" "}
                  {showCollaboration ? (
                    <>
                      <span
                        className="rounded-sm pointer-events-none"
                        style={{ backgroundColor: `${collaborators[1].color}33` }}
                      >
                        next Friday
                      </span>
                      <CollaborationCaret userName="Alex" userColor={collaborators[1].color} />
                    </>
                  ) : (
                    "next Friday"
                  )}{" "}
                  — can't wait. Still need to decide who's bringing the grill and whether we're
                  doing the hike Saturday or Sunday. <em>Check the weather before we go.</em>
                </p>

                <p className="text-gray-700 leading-relaxed mb-4">
                  The cabin has a full kitchen and a fire pit out back. We should plan at least one
                  big group dinner — maybe bur
                  {showCollaboration && (
                    <CollaborationCaret userName="Sarah" userColor={collaborators[0].color} />
                  )}
                  gers the first night? I'll bring the cooler if someone else can grab ice on the
                  way.
                </p>

                <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-3">To bring</h2>
                <ul className="list-disc pl-6 space-y-1 mb-4 text-gray-700">
                  <li>
                    <strong>Firewood + matches</strong>
                  </li>
                  <li>Ingredients for s'mores (chocolate, marshmallows, graham crackers)</li>
                  <li>Board games — Catan? Or something lighter</li>
                  <li>Bluetooth speaker for the deck</li>
                  <li>Coffee and filters (we'll need a lot)</li>
                  <li>
                    First aid kit + bug spray
                    {showCollaboration && (
                      <CollaborationCaret userName="Jordan" userColor={collaborators[2].color} />
                    )}
                  </li>
                </ul>

                <h2 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Saturday</h2>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Morning hike to the overlook, then lazy afternoon by the lake. If we're up for it
                  we could do a late campfire and stargazing — the sky should be clear.
                </p>
                <ul className="list-disc pl-6 space-y-1 mb-4 text-gray-700">
                  <li>Leave by 9am for the trailhead</li>
                  <li>Pack lunches and plenty of water</li>
                  <li>Back by 3pm for chill time / games</li>
                </ul>

                <p className="text-gray-700 leading-relaxed mb-0">
                  That's the rough plan. Add anything I missed.
                </p>
              </div>
            </div>
          </div>

          <AnimatePresence>{activeFeature === "linking" && <LinkingOverlay />}</AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function FeatureButtons({
  features,
  activeFeature,
  onFeatureChange,
}: {
  features: {
    id: Exclude<FeatureType, null>;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
  activeFeature: FeatureType;
  onFeatureChange: (feature: FeatureType) => void;
}) {
  const isActive = (id: Exclude<FeatureType, null>) => activeFeature === id;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 z-100 bottom-4 rounded-full p-1 flex items-center gap-1 border border-black shadow-[0_1px_--theme(--color-white/0.25)_inset,0_1px_3px_--theme(--color-black/0.2)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-full active:before:bg-white/0 after:pointer-events-none after:absolute after:inset-0 after:-z-10 after:rounded-full after:bg-linear-to-b after:from-white/14 after:mix-blend-overlay bg-black/75 text-white backdrop-blur-sm">
      {features.map(({ id, label, icon: Icon }) => (
        <button
          type="button"
          key={id}
          onClick={() => onFeatureChange(activeFeature === id ? null : id)}
          className={`flex items-center gap-2 px-2 py-1 rounded-xl text-[0.8125rem]/0 font-medium transition-colors ${
            isActive(id)
              ? "bg-white/30 text-white"
              : "text-white/90 hover:bg-white/20 hover:text-white"
          }`}
        >
          <Icon className="size-4 shrink-0" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function CollaborationPresence() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2 mt-4"
    >
      {collaborators.map((user) => (
        <CollaboratorAvatar key={user.name} name={user.name} color={user.color} />
      ))}
      <span className="text-xs text-gray-600 ml-1">{collaborators.length} people editing</span>
    </motion.div>
  );
}

function CustomFields({ isExpanded }: { isExpanded: boolean }) {
  const [selectedKey, setSelectedKey] = useState<string>("fields");

  return (
    <MetadataTabsShell
      selectedKey={selectedKey}
      onSelectionChange={setSelectedKey}
      isExpanded={isExpanded}
      onExpandedChange={() => null}
      documentCount={2}
      onAdd={() => {}}
      addButtonLabel={selectedKey === "fields" ? "Add field" : "Add document"}
    >
      <TabPanel id="fields">
        <div className="space-y-2">
          <CustomFieldDisplay label="Status" value="In Progress" />
          <CustomFieldDisplay label="Priority" value="High" />
          <CustomFieldDisplay label="Owner" value="Engineering Team" />
          <CustomFieldDisplay label="Target Date" value="March 31, 2026" />
        </div>
      </TabPanel>
      <TabPanel id="documents">
        <div className="ring ring-black/4 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <DocumentRegular className="size-4" />
            <span>Q4 2025 Roadmap</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <DocumentRegular className="size-4" />
            <span>Team Goals</span>
          </div>
        </div>
      </TabPanel>
    </MetadataTabsShell>
  );
}

function LinkingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-sm"
    >
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming Soon</h3>
        <p className="text-sm text-gray-600">
          Internal linking feature demonstration will be available soon.
        </p>
      </div>
    </motion.div>
  );
}

// Collaborator Avatar Component
function CollaboratorAvatar({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="size-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
      style={{ backgroundColor: color }}
      title={name}
    >
      {name[0]}
    </div>
  );
}

// Custom Field Display
function CustomFieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <span className="text-xs text-gray-900">{value}</span>
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

// Icon Components (only keeping icons not available in wysiwyg-icons.tsx)
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
