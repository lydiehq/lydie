import {
  BriefcaseRegular,
  BookRegular,
  BuildingRegular,
  HeartRegular,
  HatGraduationRegular,
  DocumentRegular,
  ChatRegular,
  SearchRegular,
  PeopleRegular,
  DocumentCopyRegular,
  EditRegular,
  LayoutColumnFourRegular,
  MailRegular,
  NewsRegular,
  TextBulletListSquareRegular,
  DocumentTextRegular,
  PersonSupportRegular,
  HeadsetRegular,
  MoneyRegular,
  MegaphoneRegular,
  NotepadRegular,
  SettingsRegular,
  PeopleSwapRegular,
  BoxMultipleRegular,
  MapRegular,
  BookOpenRegular,
  PersonSquareRegular,
  CalculatorRegular,
  ReceiptRegular,
  WalletRegular,
  CalendarSyncRegular,
  HeartPulseRegular,
  BrainCircuitRegular,
  BedRegular,
  HomeRegular,
  CalendarCheckmarkRegular,
  VehicleCarRegular,
  TagRegular,
} from "@fluentui/react-icons";

export const categoryIconMap: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  // Career and hiring
  "career-hiring": BriefcaseRegular,
  "cover-letters": DocumentCopyRegular,
  "interviewing": ChatRegular,
  "job-search": SearchRegular,
  "people-management": PeopleRegular,
  "resume": DocumentRegular,

  // Writing and publishing
  "blogging-seo": EditRegular,
  "books-long-form": BookRegular,
  "editorial-publishing-ops": LayoutColumnFourRegular,
  "newsletters-email": MailRegular,
  "pr-media": NewsRegular,
  "scripts": TextBulletListSquareRegular,
  "writing-publishing": BookRegular,

  // Business and operations
  "bids-rfps": DocumentTextRegular,
  "business-operations": BuildingRegular,
  "consulting-services": PersonSupportRegular,
  "customer-support": HeadsetRegular,
  "funding-grants": MoneyRegular,
  "marketing": MegaphoneRegular,
  "meeting-notes": NotepadRegular,
  "operations": SettingsRegular,
  "partnerships-sponsorships": PeopleSwapRegular,
  "project-management": BoxMultipleRegular,
  "sales": TagRegular,
  "strategy-planning": MapRegular,

  // Education and learning
  "class-notes": NotepadRegular,
  "education-learning": HatGraduationRegular,
  "learning-systems": BookOpenRegular,
  "research-writing": SearchRegular,
  "teaching": PersonSquareRegular,

  // Personal finance
  "budget": CalculatorRegular,
  "expense-tracker": ReceiptRegular,
  "personal-finance": WalletRegular,
  "subscription-tracker": CalendarSyncRegular,
  "taxes": DocumentRegular,

  // Health
  "fitness": HeartPulseRegular,
  "health": HeartPulseRegular,
  "mental-health": BrainCircuitRegular,
  "sleep-tracking": BedRegular,

  // Personal and life
  "home-family": HomeRegular,
  "personal-life": HeartRegular,
  "planning-productivity": CalendarCheckmarkRegular,
  "travel": VehicleCarRegular,
};
