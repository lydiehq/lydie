import {
  AddRegular,
  AlertDialog,
  AlertRegular,
  BoldRegular,
  Breadcrumb,
  Breadcrumbs,
  Button,
  Checkbox,
  CheckboxGroup,
  CodeRegular,
  CollaborationCaret,
  CollectionItemIcon,
  ComboBox,
  ComboBoxItem,
  CommandList,
  ConfirmDialog,
  Dialog,
  Disclosure,
  DisclosureGroup,
  DisclosureHeader,
  DisclosurePanel,
  DocumentThumbnailIcon,
  DragHandleGrip,
  EditorBubbleToolbar,
  Heading,
  Heading1Regular,
  Heading2Regular,
  Heading3Regular,
  InformationRegular,
  ItalicRegular,
  Link,
  LinkButton,
  LinkRegular,
  ListBox,
  ListBoxItem,
  ListCheck2Regular,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  NumberField,
  PicRegular,
  Popover,
  ProgressBar,
  QuoteLeftRegular,
  Radio,
  RadioGroup,
  SearchField,
  Select,
  SelectItem,
  Switch,
  Tab,
  TableRegular,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TagGroup,
  TextField,
  Toolbar,
  Tooltip,
  TooltipTrigger,
} from "@lydie/ui";
import type { ConfirmOptions } from "@lydie/ui";
import { useState } from "react";
import type { ReactNode } from "react";
import { DialogTrigger, MenuTrigger } from "react-aria-components";

const VARIANTS = ["primary", "secondary", "ghost", "destructive"] as const;
const SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
const ICON_SIZES = ["icon-2xs", "icon-xs", "icon-sm", "icon-md", "icon-lg", "icon-xl"] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-gray-950/5 py-8">
      <span className="text-xs font-medium text-gray-500">{title}</span>
      {children}
    </section>
  );
}

function Line({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {label && <span className="w-24 shrink-0 text-xs text-gray-500">{label}</span>}
      {children}
    </div>
  );
}

// What `app.confirm` shows: the host keeps the request and resolves its promise.
function ConfirmDemo() {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const [answer, setAnswer] = useState<boolean | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        onPress={() =>
          setRequest({
            message: "Delete “Meeting notes” forever?",
            detail: "This cannot be undone.",
            confirmLabel: "Delete forever",
            destructive: true,
          })
        }
      >
        Confirm dialog
      </Button>
      {answer !== null && (
        <span className="text-xs text-gray-500">{answer ? "Confirmed" : "Cancelled"}</span>
      )}
      <ConfirmDialog
        request={request}
        onResolve={(confirmed) => {
          setAnswer(confirmed);
          setRequest(null);
        }}
      />
    </>
  );
}

export function ComponentGallery() {
  const [pending, setPending] = useState(false);
  const [progress] = useState(64);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 pb-4">
        <h2 className="text-lg font-medium text-gray-900">@lydie/ui components</h2>
        <p className="text-sm text-gray-500">
          Every component in its variants, ported from v1's packages/ui.
        </p>
      </div>

      <Section title="Buttons">
        {VARIANTS.map((variant) => (
          <Line key={variant} label={variant}>
            {SIZES.map((size) => (
              <Button key={size} variant={variant} size={size}>
                Button {size}
              </Button>
            ))}
            <Button variant={variant} isDisabled>
              Disabled
            </Button>
            <Button variant={variant} rounded>
              Rounded
            </Button>
          </Line>
        ))}
        <Line label="icon sizes">
          {ICON_SIZES.map((size) => (
            <Button key={size} variant="secondary" size={size} aria-label={size}>
              <AddRegular />
            </Button>
          ))}
        </Line>
        <Line label="pending">
          <Button isPending={pending} onPress={() => setPending((value) => !value)}>
            {pending ? "Saving" : "Toggle pending"}
          </Button>
          <Button variant="secondary" isPending>
            Always pending
          </Button>
          <LinkButton href="#components" variant="ghost">
            Link button
          </LinkButton>
          <Link href="#components">Text link</Link>
        </Line>
        <Line label="toggle">
          <Toolbar aria-label="Example toolbar">
            <Button variant="ghost" size="icon-sm" aria-label="Bold">
              <BoldRegular className="size-[15px]" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Italic">
              <ItalicRegular className="size-[15px]" />
            </Button>
          </Toolbar>
        </Line>
      </Section>

      <Section title="Fields">
        <div className="grid grid-cols-3 gap-6">
          <TextField label="Text field" placeholder="Placeholder" description="Help text" />
          <TextField
            label="Invalid"
            isInvalid
            errorMessage="Something is wrong"
            defaultValue="Bad"
          />
          <SearchField label="Search" />
          <NumberField label="Number" defaultValue={42} />
          <Select label="Select" defaultValue="md">
            <SelectItem id="sm">Small</SelectItem>
            <SelectItem id="md">Medium</SelectItem>
            <SelectItem id="lg">Large</SelectItem>
          </Select>
          <ComboBox label="Combo box" placeholder="Pick a fruit">
            <ComboBoxItem id="apple">Apple</ComboBoxItem>
            <ComboBoxItem id="banana">Banana</ComboBoxItem>
            <ComboBoxItem id="cherry">Cherry</ComboBoxItem>
          </ComboBox>
          <CheckboxGroup label="Checkboxes" defaultValue={["a"]}>
            <Checkbox value="a">Selected</Checkbox>
            <Checkbox value="b">Unselected</Checkbox>
            <Checkbox value="c" isIndeterminate>
              Indeterminate
            </Checkbox>
            <Checkbox value="d" isDisabled>
              Disabled
            </Checkbox>
          </CheckboxGroup>
          <RadioGroup label="Radio group" defaultValue="one">
            <Radio value="one">One</Radio>
            <Radio value="two">Two</Radio>
          </RadioGroup>
          <div className="flex flex-col gap-3">
            <Switch defaultSelected>Switch on</Switch>
            <Switch>Switch off</Switch>
          </div>
        </div>
      </Section>

      <Section title="Overlays">
        <Line>
          <MenuTrigger>
            <Button variant="secondary">Menu</Button>
            <Menu>
              <MenuItem>Rename</MenuItem>
              <MenuItem>Duplicate</MenuItem>
              <MenuSeparator />
              <MenuItem>Delete</MenuItem>
            </Menu>
          </MenuTrigger>
          <DialogTrigger>
            <Button variant="secondary">Popover</Button>
            <Popover showArrow>
              <Dialog className="p-4 text-sm">A popover with an arrow.</Dialog>
            </Popover>
          </DialogTrigger>
          <TooltipTrigger>
            <Button variant="secondary">Tooltip</Button>
            <Tooltip hotkeys={["⌘", "K"]}>Quick action</Tooltip>
          </TooltipTrigger>
          <DialogTrigger>
            <Button variant="secondary">Modal</Button>
            <Modal>
              <Dialog className="p-6">
                <Heading level={2}>Modal dialog</Heading>
                <p className="mt-2 text-sm text-gray-600">Content of the modal.</p>
              </Dialog>
            </Modal>
          </DialogTrigger>
          <DialogTrigger>
            <Button variant="destructive">Alert dialog</Button>
            <Modal>
              <AlertDialog title="Delete document?" variant="destructive" actionLabel="Delete">
                This cannot be undone.
              </AlertDialog>
            </Modal>
          </DialogTrigger>
          <ConfirmDemo />
        </Line>
      </Section>

      <Section title="Collections">
        <div className="grid grid-cols-3 gap-6">
          <ListBox aria-label="List box" selectionMode="single" defaultSelectedKeys={["b"]}>
            <ListBoxItem id="a">First item</ListBoxItem>
            <ListBoxItem id="b">Selected item</ListBoxItem>
            <ListBoxItem id="c">Third item</ListBoxItem>
          </ListBox>
          <TagGroup label="Tags" items={[]}>
            <Tag id="a">Writing</Tag>
            <Tag id="b" color="green">
              Published
            </Tag>
            <Tag id="c" color="yellow">
              Draft
            </Tag>
            <Tag id="d" color="blue">
              Shared
            </Tag>
          </TagGroup>
          <Tabs>
            <TabList aria-label="Tabs">
              <Tab id="one">Fields</Tab>
              <Tab id="two">Documents</Tab>
            </TabList>
            <TabPanels>
              <TabPanel id="one" className="text-sm">
                First panel
              </TabPanel>
              <TabPanel id="two" className="text-sm">
                Second panel
              </TabPanel>
            </TabPanels>
          </Tabs>
          <Breadcrumbs>
            <Breadcrumb href="#">Workspace</Breadcrumb>
            <Breadcrumb href="#">Blog</Breadcrumb>
            <Breadcrumb>Post</Breadcrumb>
          </Breadcrumbs>
        </div>
        <DisclosureGroup>
          <Disclosure id="a">
            <DisclosureHeader>Disclosure one</DisclosureHeader>
            <DisclosurePanel>
              <p className="text-sm">Panel content.</p>
            </DisclosurePanel>
          </Disclosure>
          <Disclosure id="b">
            <DisclosureHeader>Disclosure two</DisclosureHeader>
            <DisclosurePanel>
              <p className="text-sm">More content.</p>
            </DisclosurePanel>
          </Disclosure>
        </DisclosureGroup>
      </Section>

      <Section title="Progress">
        <div className="grid grid-cols-3 items-center gap-6">
          <ProgressBar label="Progress" value={progress} />
          <ProgressBar label="Indeterminate" isIndeterminate />
        </div>
      </Section>

      <Section title="Editor chrome">
        <Line>
          <EditorBubbleToolbar
            items={[
              {
                id: "bold",
                label: "Bold",
                icon: <BoldRegular />,
                isActive: true,
                onPress: () => {},
              },
              { id: "italic", label: "Italic", icon: <ItalicRegular />, onPress: () => {} },
              { id: "code", label: "Code", icon: <CodeRegular />, onPress: () => {} },
              "separator",
              { id: "link", label: "Link", icon: <LinkRegular />, onPress: () => {} },
            ]}
            blockTypes={[
              { id: "paragraph", label: "Paragraph" },
              { id: "heading1", label: "Heading 1" },
            ]}
            activeBlockType="paragraph"
            onBlockTypeChange={() => {}}
          />
          <DragHandleGrip />
        </Line>
        <div className="w-[320px]">
          <CommandList
            selectedIndex={1}
            onSelect={() => {}}
            items={[
              { id: "h1", title: "Heading 1", icon: <Heading1Regular /> },
              {
                id: "h2",
                title: "Heading 2",
                icon: <Heading2Regular />,
                description: "Section heading",
              },
              { id: "table", title: "Table", icon: <TableRegular /> },
            ]}
          />
        </div>
      </Section>

      <Section title="Icons and layout">
        <Line label="wysiwyg">
          {[
            Heading1Regular,
            Heading2Regular,
            Heading3Regular,
            BoldRegular,
            ItalicRegular,
            CodeRegular,
            LinkRegular,
            PicRegular,
            TableRegular,
            ListCheck2Regular,
            QuoteLeftRegular,
          ].map((Icon, index) => (
            <Icon key={index} className="size-5 text-gray-700" />
          ))}
        </Line>
        <Line label="mingcute">
          <InformationRegular className="size-5 icon-muted" />
          <AlertRegular className="size-5 icon-muted" />
          <DocumentThumbnailIcon size="sm" />
          <DocumentThumbnailIcon size="md" />
          <DocumentThumbnailIcon size="lg" />
          <DocumentThumbnailIcon showFoldDecoration />
          <CollectionItemIcon />
        </Line>
        <Line label="caret">
          <span className="relative mt-4 text-sm">
            Someone is typing here
            <CollaborationCaret userName="Ada" userColor="#9BB5D4" />
          </span>
        </Line>
      </Section>
    </div>
  );
}
