import type { PropertyType } from "@lydie/contract";
import {
  AlignLeftRegular,
  ArrowRightUpRegular,
  AttachmentRegular,
  CalendarRegular,
  CheckboxRegular,
  CircleChevronDownRegular,
  CircleUserRegular,
  FormulaRegular,
  HashtagRegular,
  LinkRegular,
  ListOrderedRegular,
  MailRegular,
  PhoneRegular,
  Progress50Regular,
  SearchRegular,
  TagRegular,
  TextRegular,
  TimeRegular,
  User3Regular,
} from "@lydie/ui";
import type { Icon, IconProps } from "@lydie/ui";

export const TYPE_ICONS: Record<PropertyType, Icon> = {
  title: TextRegular,
  text: AlignLeftRegular,
  number: HashtagRegular,
  select: CircleChevronDownRegular,
  multiSelect: TagRegular,
  status: Progress50Regular,
  date: CalendarRegular,
  checkbox: CheckboxRegular,
  url: LinkRegular,
  email: MailRegular,
  phone: PhoneRegular,
  person: User3Regular,
  files: AttachmentRegular,
  relation: ArrowRightUpRegular,
  rollup: SearchRegular,
  formula: FormulaRegular,
  uniqueId: ListOrderedRegular,
  createdTime: TimeRegular,
  updatedTime: TimeRegular,
  createdBy: CircleUserRegular,
  updatedBy: CircleUserRegular,
};

export function TypeIcon({ type, ...props }: IconProps & { type: PropertyType }) {
  const Glyph = TYPE_ICONS[type];
  return <Glyph {...props} />;
}
