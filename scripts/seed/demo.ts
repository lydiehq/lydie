// A workspace that looks like a real person's: Maya, a product designer who runs a small studio
// and keeps her work and life in Lydie. Written through operations only, so the same content goes
// into a folder (through the file bridge) or a hosted workspace (through the API).
//
// Dates are relative to `today`, so the journal, meetings and due dates always look current.
// Titles avoid characters a file name cannot hold (`/:*?"<>|#^[]`).
import type { Operations, PropertyConfigInput, PropertyType } from "@lydie/contract";
import type { OpsProxy } from "@lydie/runtime";

export type DemoOps = Pick<OpsProxy<Operations>, "doc" | "database">;

export type DemoOptions = {
  workspaceId: string;
  // YYYY-MM-DD. Default: the local date.
  today?: string;
  // Hosted: the teamspace top-level pages go into (null: the creator's private section).
  teamspaceId?: string | null;
};

export type DemoResult = { documents: number; databases: number };

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export async function seedDemo(ops: DemoOps, options: DemoOptions): Promise<DemoResult> {
  const { workspaceId } = options;
  const today = options.today ?? localToday();
  const base = new Date(`${today}T12:00:00Z`);
  // `day(-3)` is three days ago.
  const day = (offset: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const weekday = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const space =
    options.teamspaceId === undefined ? {} : { teamspaceId: options.teamspaceId ?? null };

  let documents = 0;
  let databases = 0;
  const page = async (
    title: string,
    markdown?: string,
    extra: { parentId?: string; properties?: Record<string, unknown> } = {},
  ) => {
    const doc = await ops.doc.create({
      workspaceId,
      title,
      parentId: extra.parentId ?? null,
      ...(extra.parentId ? {} : space),
      ...(markdown === undefined ? {} : { markdown: `${markdown.trim()}\n` }),
      ...(extra.properties ? { properties: extra.properties as never } : {}),
    });
    documents++;
    return doc.id;
  };
  const folder = (title: string, parentId?: string) =>
    page(title, undefined, parentId ? { parentId } : {});
  const database = async (title: string, parentId?: string) => {
    const def = await ops.database.create({
      workspaceId,
      title,
      parentId: parentId ?? null,
      ...(parentId ? {} : space),
    });
    documents++;
    databases++;
    return {
      id: def.database.id,
      titleProperty: def.properties[0]!.id,
      firstView: def.views[0]!.id,
    };
  };
  // Turns a page that already has sub-pages into a collection: their frontmatter stays as it is and
  // lights up once a property with the same key exists.
  const collectionFrom = async (documentId: string) => {
    const def = await ops.database.create({ workspaceId, documentId });
    databases++;
    return {
      id: def.database.id,
      titleProperty: def.properties[0]!.id,
      firstView: def.views[0]!.id,
    };
  };
  const property = async (
    databaseId: string,
    name: string,
    key: string,
    type: PropertyType,
    config: PropertyConfigInput = {},
  ) => (await ops.database.addProperty({ databaseId, name, key, type, config })).id;

  // ---- Home and inbox

  await page(
    "Home",
    `
Everything starts here. Work lives in [[Projects]] and [[Tasks]], money in [[Expenses]], the rest is notes.

> [!tip] This week
> Ship the [[Website redesign]] homepage, finish the [[Kitchen renovation]] budget, and book the ferry for the [[Lisbon trip]].

## Open tasks

![[Tasks.base#Due soon]]

## Shortcuts

- Today's note: [[${day(0)}]]
- [[Inbox]] for anything unsorted
- [[Reading list]] · [[Recipes]] · [[Running log]]
`,
  );

  await page(
    "Inbox",
    `
- Ask Jonas whether the pricing page can wait until after launch
- Book a dentist appointment
- Idea: a "what changed" digest for clients, every Friday
- Look into [[Thinking in Systems]] for the onboarding essay
- Renew passport before the [[Lisbon trip]] (expires in March!)
- Check whether the tile shop delivers on Saturdays
`,
  );

  // ---- Projects (a database whose rows are full project pages)

  const projects = await database("Projects");
  const projectStatus = await property(projects.id, "Status", "status", "status", {
    options: [
      { name: "Planned", color: "gray", group: "todo" },
      { name: "In progress", color: "blue", group: "inProgress" },
      { name: "On hold", color: "yellow", group: "inProgress" },
      { name: "Done", color: "green", group: "complete" },
    ],
  });
  await property(projects.id, "Area", "area", "select", {
    options: [
      { name: "Studio", color: "purple" },
      { name: "Client", color: "blue" },
      { name: "Personal", color: "orange" },
    ],
  });
  const projectStart = await property(projects.id, "Start", "start", "date");
  await property(projects.id, "Target", "target", "date");
  const projectBudget = await property(projects.id, "Budget", "budget", "number", {
    numberFormat: "currency",
    currency: "EUR",
  });
  await ops.database.updateView({
    id: projects.firstView,
    config: { sorts: [{ propertyId: projectStart, direction: "desc" }] },
  });
  await ops.database.createView({
    databaseId: projects.id,
    name: "Board",
    type: "board",
    config: { groupBy: { propertyId: projectStatus, direction: "asc" } },
  });

  const project = (title: string, properties: Record<string, unknown>, markdown: string) =>
    page(title, markdown, { parentId: projects.id, properties });

  const website = await project(
    "Website redesign",
    { status: "In progress", area: "Studio", start: day(-41), target: day(12), budget: 8000 },
    `
The studio site still says we "craft digital experiences". Time to show the work instead.

## Goals

1. A homepage that shows three case studies above the fold
2. Pages that load in under a second on a phone
3. Something we can update ourselves without a developer

## Decisions

- **Stack:** Astro with Markdown content, deployed on a static host. Decided in [[${day(-20)} Design review]].
- **Type:** Inter for UI, Fraunces for headings. ==Still need the licence for Fraunces.==
- **No blog** for now. Writing goes to the newsletter.

## Links

- [[Research synthesis]] from the client interviews
- [[Homepage copy]] (draft 3)
- Tasks: ![[Tasks.base#Board]]

| Page | Owner | State |
| --- | --- | --- |
| Home | Maya | Copy in review |
| Work | Jonas | Two of five case studies |
| About | Maya | Not started |
| Contact | Jonas | Done |
`,
  );

  const onboarding = await project(
    "Mobile onboarding for Fernweh",
    { status: "In progress", area: "Client", start: day(-26), target: day(30), budget: 24000 },
    `
Client: Fernweh, a travel journaling app. Contact: Lena Hoffmann (product lead).

## Brief

New users drop off at the permissions step: 38% never get to their first entry. Lena wants the
first entry written within two minutes of install.

> [!note] What we agreed
> Four weeks of design, then two weeks supporting their engineers. Weekly check-ins on Thursdays.

## Approach

- Week 1: interviews and funnel data (see [[Research synthesis]])
- Week 2: three directions, one prototype each
- Week 3: test with eight users
- Week 4: final flows and a handover doc

## Numbers so far

| Step | Users | Drop-off |
| --- | ---: | ---: |
| Install | 1,000 | |
| Account | 812 | 19% |
| Permissions | 503 | 38% |
| First entry | 311 | 38% |

Open question: can we ask for location *after* the first entry? Lena is checking with legal.
`,
  );

  const q1 = await project(
    "Q1 planning",
    { status: "Planned", area: "Studio", start: day(18), target: day(46) },
    `
Rough plan for the first quarter. To be finished in the offsite.

- [ ] Decide on the second hire (see [[Hiring a designer]])
- [ ] Raise day rate by 10% for new clients
- [ ] Two talks submitted (UX Lisbon, Smashing)
- [ ] Studio retreat: dates and place

## Revenue target

$$
\\text{target} = 3 \\times \\text{monthly costs} + \\text{buffer}
$$

Monthly costs are about €14k, so roughly €45k a month with a small buffer.
`,
  );

  const hiring = await project(
    "Hiring a designer",
    { status: "On hold", area: "Studio", start: day(-60), target: day(75) },
    `
Paused until the Fernweh contract is signed. The job post is ready.

## Job post (draft)

We're a two-person product studio looking for a designer who likes the boring parts:
edge cases, empty states, error messages. You'll work directly with clients.

## Shortlist

- Ana (portfolio strong on systems, weak on research)
- Tomás (ex-agency, wants smaller teams)
- Referral from Lena, no portfolio yet
`,
  );

  const kitchen = await project(
    "Kitchen renovation",
    { status: "In progress", area: "Personal", start: day(-75), target: day(40), budget: 18500 },
    `
New worktop, tiles and a proper extractor. Keeping the cabinets.

## Budget

Every quote and payment is a page in [[Expenses]]. This is the same collection, filtered to this
project:

![[Expenses.base#Kitchen renovation]]

## Contacts

- Tiler: Marco, available from the 20th
- Electrician: needs the socket plan first

> [!warning]
> The fitter needs the old tiles off **before** he measures. Book the skip.
`,
  );

  const lisbon = await project(
    "Lisbon trip",
    { status: "Planned", area: "Personal", start: day(33), target: day(40) },
    `
A week in Lisbon with Sam, then two days at UX Lisbon if the talk is accepted.

## Packing

- [ ] Passport (renew!)
- [ ] Adapter
- [x] Book flights
- [ ] Book the ferry to Cacilhas
- [ ] Download offline maps

## Places

- Time Out Market (touristy, but Sam wants to go)
- Miradouro da Senhora do Monte at sunset
- Pastéis de Belém, early, before the queues
- LX Factory on Sunday

See also [[Packing list]].
`,
  );

  // ---- Tasks (relates to Projects, both ways)

  const tasks = await database("Tasks");
  const taskStatus = await property(tasks.id, "Status", "status", "status", {
    options: [
      { name: "To do", color: "gray", group: "todo" },
      { name: "Doing", color: "blue", group: "inProgress" },
      { name: "Waiting", color: "yellow", group: "inProgress" },
      { name: "Done", color: "green", group: "complete" },
    ],
  });
  const priority = await property(tasks.id, "Priority", "priority", "select", {
    options: [
      { name: "High", color: "red" },
      { name: "Medium", color: "orange" },
      { name: "Low", color: "gray" },
    ],
  });
  const due = await property(tasks.id, "Due", "due", "date");
  const projectRelation = await ops.database.addProperty({
    databaseId: tasks.id,
    name: "Project",
    key: "project",
    type: "relation",
    reverseName: "Tasks",
    config: { relation: { databaseId: projects.id, twoWay: true, limit: "one" } },
  });
  // Filled in when a task is done, so a project can show how much of its work is finished.
  const completed = await property(tasks.id, "Completed", "completed", "date");
  await property(tasks.id, "Tags", "tags", "multiSelect", {
    options: [
      { name: "design", color: "purple" },
      { name: "writing", color: "blue" },
      { name: "admin", color: "gray" },
      { name: "errand", color: "brown" },
      { name: "client", color: "green" },
    ],
  });
  await ops.database.updateView({
    id: tasks.firstView,
    config: { sorts: [{ propertyId: due, direction: "asc" }] },
  });
  await ops.database.renameView({ id: tasks.firstView, name: "All tasks" });
  await ops.database.createView({
    databaseId: tasks.id,
    name: "Board",
    type: "board",
    config: { groupBy: { propertyId: taskStatus, direction: "asc" } },
  });
  await ops.database.createView({
    databaseId: tasks.id,
    name: "Due soon",
    type: "table",
    config: {
      filter: {
        type: "group",
        combinator: "and",
        children: [
          { type: "condition", propertyId: taskStatus, op: "neq", value: "Done" },
          {
            type: "condition",
            propertyId: due,
            op: "lte",
            value: { relative: "today", amount: 14, unit: "day" },
          },
        ],
      },
      sorts: [
        { propertyId: due, direction: "asc" },
        { propertyId: priority, direction: "asc" },
      ],
    },
  });
  await ops.database.createView({
    databaseId: tasks.id,
    name: "Calendar",
    type: "calendar",
    config: { layout: { calendarPropertyId: due } },
  });

  const taskRows: [string, string, string, number, string | null, string[], string?][] = [
    ["Finish homepage copy", "Doing", "High", 2, website, ["writing"]],
    ["Export case study images", "To do", "Medium", 5, website, ["design"]],
    ["Buy Fraunces licence", "To do", "Low", 7, website, ["admin"]],
    ["Set up redirects from old URLs", "To do", "Medium", 10, website, []],
    ["Write the About page", "To do", "Medium", 9, website, ["writing"]],
    ["Pick the hero case study", "Done", "High", -6, website, ["design"]],
    [
      "Prototype direction B (skip permissions)",
      "Doing",
      "High",
      1,
      onboarding,
      ["design", "client"],
      `
Direction B asks for nothing up front. Location and notifications are requested in context:
location when you add a place to an entry, notifications after the third entry.

- [x] Flow sketch
- [ ] Figma prototype
- [ ] Copy for the two prompts
`,
    ],
    ["Recruit 8 testers via Lena", "Waiting", "High", 3, onboarding, ["client"]],
    ["Write test script", "To do", "Medium", 4, onboarding, ["writing", "client"]],
    ["Send weekly update to Lena", "To do", "Medium", 0, onboarding, ["client"]],
    ["Funnel analysis", "Done", "High", -12, onboarding, ["client"]],
    ["Invoice Fernweh for weeks 1–2", "Done", "Medium", -4, onboarding, ["admin"]],
    ["Draft offsite agenda", "To do", "Low", 16, q1, ["writing"]],
    ["Check UX Lisbon CFP deadline", "To do", "Medium", 6, q1, ["admin"]],
    ["Call two references for Ana", "Waiting", "Low", 20, hiring, []],
    ["Book the skip", "To do", "High", 1, kitchen, ["errand"]],
    ["Choose tile grout colour", "To do", "Low", 8, kitchen, ["errand"]],
    ["Pay worktop balance", "To do", "Medium", 14, kitchen, ["admin"]],
    ["Send socket plan to electrician", "Done", "High", -3, kitchen, ["errand"]],
    ["Renew passport", "To do", "High", 4, lisbon, ["admin", "errand"]],
    ["Book ferry and the Sintra day trip", "To do", "Low", 21, lisbon, []],
    ["Dentist", "To do", "Medium", 11, null, ["errand"]],
    ["File quarterly VAT", "To do", "High", 13, null, ["admin"]],
    ["Reply to the podcast invitation", "Waiting", "Low", -1, null, ["writing"]],
  ];
  const relationUpdates: { rowId: string; set: Record<string, string[]> }[] = [];
  for (const [title, status, prio, dueIn, projectId, tags, body] of taskRows) {
    const id = await page(title, body, {
      parentId: tasks.id,
      properties: {
        status,
        priority: prio,
        due: day(dueIn),
        ...(status === "Done" ? { completed: day(dueIn) } : {}),
        tags,
      },
    });
    if (projectId) relationUpdates.push({ rowId: id, set: { [projectRelation.id]: [projectId] } });
  }
  // Non-exact, so the projects' "Tasks" side is filled in too.
  await ops.database.setValues({ databaseId: tasks.id, updates: relationUpdates });

  // ---- Expenses (budget tracking: grouped views with sums, and totals shown on each project)

  const expenses = await database("Expenses");
  const amount = await property(expenses.id, "Amount", "amount", "number", {
    numberFormat: "currency",
    currency: "EUR",
  });
  const expenseDate = await property(expenses.id, "Date", "date", "date");
  const category = await property(expenses.id, "Category", "category", "select", {
    options: [
      { name: "Materials", color: "brown" },
      { name: "Labour", color: "orange" },
      { name: "Software", color: "blue" },
      { name: "Services", color: "purple" },
      { name: "Travel", color: "green" },
      { name: "Research", color: "pink" },
    ],
  });
  const paid = await property(expenses.id, "Paid", "paid", "checkbox");
  await property(expenses.id, "Vendor", "vendor", "text");
  const expenseProject = await ops.database.addProperty({
    databaseId: expenses.id,
    name: "Project",
    key: "project",
    type: "relation",
    reverseName: "Expenses",
    config: { relation: { databaseId: projects.id, twoWay: true, limit: "one" } },
  });
  const total = { [amount]: "Sum" };
  await ops.database.renameView({ id: expenses.firstView, name: "All expenses" });
  await ops.database.updateView({
    id: expenses.firstView,
    config: { sorts: [{ propertyId: expenseDate, direction: "desc" }], summaries: total },
  });
  await ops.database.createView({
    databaseId: expenses.id,
    name: "By category",
    type: "table",
    config: {
      groupBy: { propertyId: category, direction: "asc" },
      sorts: [{ propertyId: amount, direction: "desc" }],
      summaries: total,
    },
  });
  await ops.database.createView({
    databaseId: expenses.id,
    name: "By month",
    type: "table",
    config: {
      groupBy: { propertyId: expenseDate, direction: "desc", dateBucket: "month" },
      sorts: [{ propertyId: expenseDate, direction: "desc" }],
      summaries: total,
    },
  });
  await ops.database.createView({
    databaseId: expenses.id,
    name: "Unpaid",
    type: "table",
    config: {
      filter: {
        type: "group",
        combinator: "and",
        children: [{ type: "condition", propertyId: paid, op: "eq", value: false }],
      },
      sorts: [{ propertyId: expenseDate, direction: "asc" }],
      summaries: total,
    },
  });
  await ops.database.createView({
    databaseId: expenses.id,
    name: "Kitchen renovation",
    type: "table",
    config: {
      filter: {
        type: "group",
        combinator: "and",
        children: [
          { type: "condition", propertyId: expenseProject.id, op: "contains", value: kitchen },
        ],
      },
      sorts: [{ propertyId: expenseDate, direction: "asc" }],
      columns: [
        { propertyId: expenses.titleProperty },
        { propertyId: amount },
        { propertyId: paid },
        { propertyId: expenseDate },
        { propertyId: category, visible: false },
        { propertyId: expenseProject.id, visible: false },
      ],
      summaries: total,
    },
  });

  const expenseRows: [string, number, number, string, boolean, string, string | null][] = [
    ["Oak worktop, deposit", 1200, -30, "Materials", true, "Holz & Stein", kitchen],
    ["Oak worktop, balance", 1200, 14, "Materials", false, "Holz & Stein", kitchen],
    ["Extractor hood", 890, -21, "Materials", true, "Elektro Brandt", kitchen],
    ["Tiles and fitting", 3100, 22, "Labour", false, "Marco Bianchi", kitchen],
    ["Electrician", 1150, 18, "Labour", false, "Voltwerk", kitchen],
    ["Plumber", 600, 25, "Labour", false, "Rohr & Söhne", kitchen],
    ["Skip hire", 240, 1, "Services", false, "Containerdienst Nord", kitchen],
    ["Fraunces licence", 280, 7, "Software", false, "Undercase Type", website],
    ["Case study photography", 650, -15, "Services", true, "Studio Nord", website],
    ["Hosting, first year", 96, -34, "Software", true, "Netlify", website],
    ["Tester incentives, 8 people", 320, 3, "Research", false, "Fernweh beta list", onboarding],
    ["Prototyping tool, team plan", 45, -20, "Software", true, "ProtoPie", onboarding],
    ["Train to Hamburg for the kickoff", 138, -25, "Travel", true, "Deutsche Bahn", onboarding],
    ["Flights to Lisbon", 312, -10, "Travel", true, "TAP", lisbon],
    ["Apartment in Alfama", 640, -9, "Travel", true, "Casa do Largo", lisbon],
    ["Figma, monthly", 180, -5, "Software", true, "Figma", null],
    ["Coworking desks", 390, -3, "Services", true, "Werkhaus", null],
    ["Accountant, third quarter", 420, -18, "Services", true, "Petersen & Co", null],
  ];
  const expenseRelations: { rowId: string; set: Record<string, string[]> }[] = [];
  for (const [title, cost, dateIn, cat, isPaid, vendor, projectId] of expenseRows) {
    const id = await page(title, undefined, {
      parentId: expenses.id,
      properties: { amount: cost, date: day(dateIn), category: cat, paid: isPaid, vendor },
    });
    if (projectId) expenseRelations.push({ rowId: id, set: { [expenseProject.id]: [projectId] } });
  }
  await ops.database.setValues({ databaseId: expenses.id, updates: expenseRelations });

  // Projects read from both collections that link to them: progress from Tasks, costs from
  // Expenses, and what is left of the budget.
  await property(projects.id, "Progress", "progress", "rollup", {
    rollup: {
      relationPropertyId: projectRelation.config.relation!.reversePropertyId!,
      targetPropertyId: completed,
      function: "percentNotEmpty",
    },
    numberFormat: "percent",
  });
  const projectCosts = await property(projects.id, "Costs", "costs", "rollup", {
    rollup: {
      relationPropertyId: expenseProject.config.relation!.reversePropertyId!,
      targetPropertyId: amount,
      function: "sum",
    },
    numberFormat: "currency",
    currency: "EUR",
  });
  await property(projects.id, "Remaining", "remaining", "formula", {
    expression: "if(budget, budget - formula.costs, null)",
    numberFormat: "currency",
    currency: "EUR",
  });
  await ops.database.updateView({
    id: projects.firstView,
    config: { summaries: { [projectBudget]: "Sum", [projectCosts]: "Sum" } },
  });

  // ---- Daily notes

  const daily = await folder("Daily notes");
  const journal: [number, string][] = [
    [
      0,
      `
## Plan

- [ ] Homepage copy, last pass on the intro paragraph
- [ ] [[Send weekly update to Lena]]
- [ ] Book the skip for the kitchen

## Notes

Woke up early, ran 6 km along the river (see [[Running log]]).
`,
    ],
    [
      -1,
      `
## Plan

- [x] Prototype direction B: flow sketch
- [ ] Reply to the podcast invitation
- [x] Groceries for [[Weeknight tomato pasta]]

## Notes

Direction B feels right. Nobody reads a permissions screen; they read a reason at the moment it matters.
Jonas disagrees on notifications. We'll test both.
`,
    ],
    [
      -2,
      `
## Notes

- [[${day(-2)} Fernweh check-in]] went well. Lena is fine with moving location to later.
- Read 40 pages of [[Thinking in Systems]]. The bit on delays explains our invoice cash flow perfectly.
- Tiler came by. Old tiles have to go first.
`,
    ],
    [
      -3,
      `
Quiet day. Sent the socket plan, cleaned up the [[Research synthesis]], made soup.

> Small, consistent steps beat heroic weekends.
`,
    ],
    [
      -6,
      `
## Plan

- [x] Pick the hero case study
- [x] Weekly review

## Weekly review

**Went well:** Fernweh kickoff, finally decided on the stack.
**Didn't:** too many meetings on Tuesday, no deep work.
**Next week:** protect mornings. Calendar blocks until 11:00.
`,
    ],
    [
      -7,
      `
Long run, 14 km. Legs fine, left knee a bit stiff after 10.

Dinner with Sam and Priya. Priya wants to try Lydie for her thesis notes.
`,
    ],
    [
      -8,
      `
## Notes

- [[${day(-8)} Design review]] with Jonas: homepage sections agreed.
- Fernweh interviews 4 and 5 done. Pattern is clear: people install on a trip and want to write *now*.
`,
    ],
    [
      -9,
      `
- [x] Interview 3 ([[Interview with Tom (Fernweh user)]])
- [x] Invoice Fernweh
- [ ] Call the plumber (again)
`,
    ],
    [
      -13,
      `
Started [[Thinking in Systems]]. Bought tiles. Too many tabs open.
`,
    ],
  ];
  // Oldest first.
  for (const [offset, body] of [...journal].sort((a, b) => a[0] - b[0])) {
    await page(day(offset), `*${weekday(day(offset))}*\n\n${body.trim()}`, { parentId: daily });
  }

  // ---- Meetings

  // Oldest first, as they were written.
  const meetings = await page(
    "Meetings",
    `
Notes from every meeting, one page each. Name each one with the date first, so the list sorts
itself.

Client meetings get a short summary sent to the client the same day.
`,
  );
  await page(
    `${day(-20)} Design review`,
    `
**Attendees:** Jonas, Maya

- Stack for the new site: Astro + Markdown. Jonas will set it up.
- Maya to draft the homepage copy (see [[Homepage copy]]).
- Look at three studio sites we like before the next review.
`,
    { parentId: meetings, properties: { date: day(-20), type: "internal", attendees: ["Jonas"] } },
  );
  await page(
    `${day(-8)} Design review`,
    `
**Attendees:** Jonas, Maya

## Homepage

Agreed on the sections: intro, three case studies, how we work, contact. The "services" grid goes.

> [!question] Open
> Do we show client logos? Jonas: yes. Maya: only with a quote attached.

## Case studies

| Case study | Status | Hero image |
| --- | --- | --- |
| Fernweh | In progress | — |
| Oak & Iron | Ready | Shop floor photo |
| Tidepool | Ready | App screens |
`,
    { parentId: meetings, properties: { date: day(-8), type: "internal", attendees: ["Jonas"] } },
  );
  await page(
    `${day(-2)} Fernweh check-in`,
    `
**Attendees:** Lena Hoffmann, Maya, Jonas

## Agenda

1. Interview findings
2. Three directions
3. Test plan

## Notes

- Lena liked direction B (no permissions up front). Engineering worry: location is used for the
  entry's map, so entries without it need a fallback. Proposal: city from the photo's metadata.
- Testers: Lena will recruit from their beta list. Eight people, mixed iOS and Android.
- Legal is fine with asking for location later, as long as the prompt explains why.

## Action items

- [ ] Maya: prototype for direction B by Friday
- [ ] Jonas: test script draft
- [ ] Lena: testers by next Tuesday
`,
    {
      parentId: meetings,
      // `location` is not a property of the collection: it shows as an extra key on this page.
      properties: {
        date: day(-2),
        type: "client",
        attendees: ["Lena Hoffmann", "Jonas"],
        location: "Fernweh office, Hamburg",
      },
    },
  );
  await page(
    "One-on-one with Jonas",
    `
Running notes, newest first.

## ${day(-5)}

- He wants to lead the next client project end to end. Fernweh handover could be the start.
- Workload is fine, but Tuesdays are packed. Move the studio sync to Monday afternoon?

## ${day(-19)}

- Talked about the conference talk. He'll co-present if it's accepted.
- Asked for a budget for courses: yes, €1,000 a year.
`,
    { parentId: meetings, properties: { type: "one-on-one", attendees: ["Jonas"] } },
  );
  // Meetings started as a plain page with sub-pages. Turning it into a collection keeps its text
  // and adopts the keys the notes already had.
  const meetingsCollection = await collectionFrom(meetings);
  const meetingDate = await property(meetingsCollection.id, "Date", "date", "date");
  const meetingType = await property(meetingsCollection.id, "Type", "type", "select", {
    options: [
      { name: "internal", color: "gray" },
      { name: "client", color: "green" },
      { name: "one-on-one", color: "purple" },
    ],
  });
  await property(meetingsCollection.id, "Attendees", "attendees", "multiSelect", {
    options: [
      { name: "Jonas", color: "blue" },
      { name: "Lena Hoffmann", color: "orange" },
    ],
  });
  await ops.database.updateView({
    id: meetingsCollection.firstView,
    config: { sorts: [{ propertyId: meetingDate, direction: "desc" }] },
  });
  await ops.database.createView({
    databaseId: meetingsCollection.id,
    name: "By type",
    type: "list",
    config: {
      groupBy: { propertyId: meetingType, direction: "asc" },
      sorts: [{ propertyId: meetingDate, direction: "desc" }],
    },
  });
  await ops.database.createView({
    databaseId: meetingsCollection.id,
    name: "Calendar",
    type: "calendar",
    config: { layout: { calendarPropertyId: meetingDate } },
  });

  // ---- Research

  const research = await folder("Research");
  await page(
    "Research synthesis",
    `
Five interviews with Fernweh users, two weeks of funnel data.

## Findings

1. **People install on the trip, not before.** Four of five installed in the first two days of
   travel. ^installed-on-trip
2. **The permissions screen reads as a wall.** Nobody remembered what it asked for. ^permissions-wall
3. **The first entry is a photo, not text.** Everyone started from a picture.

## Quotes

> "I just wanted to write down where we had dinner, and it asked me about notifications."
> ([[Interview with Tom (Fernweh user)]])

> "I thought it needed my location for everything, so I said no to all of it."
> ([[Interview with Aiko (Fernweh user)]])

## What it means

Lead with the camera roll. Ask for permissions in context. See [[Mobile onboarding for Fernweh]].
`,
    { parentId: research, properties: { tags: ["research", "fernweh"] } },
  );
  await page(
    "Interview with Tom (Fernweh user)",
    `
Tom, 34, teacher. Uses Fernweh for family trips. Android.

- Installed at the airport after a friend recommended it
- Skipped the account step twice, then gave up and used Google sign-in
- Denied all permissions: "it asked me about notifications"
- First entry came three days later, from a photo of a restaurant menu

Follow-up: would he use a widget? "Maybe, if it showed last year's trip."
`,
    { parentId: research, properties: { tags: ["interview", "fernweh"], date: day(-9) } },
  );
  await page(
    "Interview with Aiko (Fernweh user)",
    `
Aiko, 27, product manager. Travels for work, iOS.

- Thought location was required for everything, denied it, then couldn't find how to turn it on
- Writes short entries, mostly on the train back to the hotel
- Wants to export entries as a PDF for her parents

See [[Research synthesis#Findings]].
`,
    { parentId: research, properties: { tags: ["interview", "fernweh"], date: day(-8) } },
  );

  // ---- Writing

  const writing = await folder("Writing");
  await page(
    "Homepage copy",
    `
## Intro (draft 3)

We're a two-person design studio in Rotterdam. We help small product teams find what's
confusing in their apps and fix it, usually in four to eight weeks.

## How we work

**We start with your users, not your backlog.** Every project begins with interviews and the
data you already have.

**We stay until it ships.** Design is not done when the Figma file is. We work with your
engineers until it's in the hands of real people.

## Notes

- Too long? Jonas thinks the intro should be one sentence.
- "Confusing" might read as negative. Alternatives: "hard", "slow", "where people get stuck".
`,
    { parentId: writing, properties: { status: "draft" } },
  );
  await page(
    "On tools that get out of the way",
    `
Most software asks for attention it hasn't earned. A good tool feels like a pencil: you notice it
only when it breaks.[^1]

## Three tests

1. Can you use it without learning anything new?
2. Does it keep your work in a form you own?
3. Would you notice if it disappeared, or would you just reach for something else?

The second one matters most to me. My notes from 2014 are still readable because they are plain
text files. The app I wrote them in has been gone for years.

> [!note] Draft
> Needs a better ending. Maybe tie back to the pencil?

[^1]: Heidegger called this "ready-to-hand", which is the kind of thing you say once in an essay
    and never again.
`,
    { parentId: writing, properties: { status: "draft", tags: ["essay"] } },
  );
  await page(
    "Newsletter 12",
    `
**Subject:** Ask later

Hi all,

This month we learned (again) that the best time to ask for something is when the person can see
why you need it. More in the Fernweh notes once we can share them.

**Reading:** [[Thinking in Systems]], slowly.
**Listening:** the new Khruangbin album, on repeat in the studio.

Until next month,
Maya
`,
    { parentId: writing, properties: { status: "scheduled", publish: day(5) } },
  );

  // ---- Reading list (a database with notes in some rows)

  const reading = await database("Reading list");
  const readingStatus = await property(reading.id, "Status", "status", "status", {
    options: [
      { name: "Want to read", color: "gray", group: "todo" },
      { name: "Reading", color: "blue", group: "inProgress" },
      { name: "Finished", color: "green", group: "complete" },
    ],
  });
  await property(reading.id, "Author", "author", "text");
  await property(reading.id, "Rating", "rating", "number");
  await property(reading.id, "Genre", "genre", "multiSelect", {
    options: [
      { name: "Design", color: "purple" },
      { name: "Systems", color: "blue" },
      { name: "Fiction", color: "pink" },
      { name: "Business", color: "green" },
      { name: "Food", color: "orange" },
    ],
  });
  await property(reading.id, "Finished", "finished", "date");
  await ops.database.createView({
    databaseId: reading.id,
    name: "Shelf",
    type: "board",
    config: { groupBy: { propertyId: readingStatus, direction: "asc" } },
  });
  const books: [string, string, string, number | null, string[], number | null, string?][] = [
    [
      "Thinking in Systems",
      "Donella Meadows",
      "Reading",
      null,
      ["Systems"],
      null,
      `
## Highlights

- A system is more than the sum of its parts. It has a purpose, and the purpose is shown by
  behaviour, not by what anyone says.
- **Delays** in feedback loops cause oscillation. (Our invoicing: we hire when cash looks good,
  which reflects work from three months ago.)
- Leverage points, in increasing order of power: numbers, buffers, structure, delays, feedback,
  information flows, rules, goals, paradigms.

## For the essay

The "leverage points" list could frame [[On tools that get out of the way]].
`,
    ],
    [
      "The Design of Everyday Things",
      "Don Norman",
      "Finished",
      5,
      ["Design"],
      -120,
      `
Re-read for the third time. Still the best on signifiers and feedback.

- Two gulfs: execution (how do I do it?) and evaluation (did it work?)
- If a door needs a sign, the door is the problem
`,
    ],
    ["Klara and the Sun", "Kazuo Ishiguro", "Finished", 4, ["Fiction"], -45],
    ["Shape Up", "Ryan Singer", "Finished", 4, ["Business", "Design"], -200],
    ["Salt, Fat, Acid, Heat", "Samin Nosrat", "Finished", 5, ["Food"], -300],
    ["The Mom Test", "Rob Fitzpatrick", "Finished", 4, ["Business"], -90],
    [
      "Tomorrow, and Tomorrow, and Tomorrow",
      "Gabrielle Zevin",
      "Want to read",
      null,
      ["Fiction"],
      null,
    ],
    ["Working in Public", "Nadia Eghbal", "Want to read", null, ["Business"], null],
    ["How Buildings Learn", "Stewart Brand", "Want to read", null, ["Design", "Systems"], null],
  ];
  for (const [title, author, status, rating, genre, finished, body] of books) {
    await page(title, body, {
      parentId: reading.id,
      properties: {
        author,
        status,
        genre,
        ...(rating === null ? {} : { rating }),
        ...(finished === null ? {} : { finished: day(finished) }),
      },
    });
  }

  // ---- Areas

  const areas = await folder("Areas");
  const health = await folder("Health", areas);
  await page(
    "Running log",
    `
Goal: the Rotterdam half marathon in April, under 1:55.

| Date | Distance | Time | Notes |
| --- | ---: | ---: | --- |
| ${day(0)} | 6.0 km | 33:10 | Easy, river loop |
| ${day(-3)} | 8.2 km | 44:02 | Intervals, 6 × 400 m |
| ${day(-7)} | 14.0 km | 1:21:45 | Long run, knee stiff after 10 km |
| ${day(-10)} | 6.5 km | 36:20 | Easy |
| ${day(-14)} | 12.0 km | 1:09:30 | Long run |

Weekly distance is up 30% this month. Too fast? Keep the next long run at 14 km.
`,
    { parentId: health },
  );
  await page(
    "Physio exercises",
    `
For the left knee, twice a day.

- [ ] Clamshells, 3 × 15 each side
- [ ] Single-leg squats to a chair, 3 × 10
- [ ] Calf raises, 3 × 20
- [ ] Foam roller, IT band, 2 minutes
`,
    { parentId: health },
  );
  const finances = await folder("Finances", areas);
  await page(
    "Budget 2026",
    `
| Category | Monthly | Yearly |
| --- | ---: | ---: |
| Rent | €1,450 | €17,400 |
| Groceries | €520 | €6,240 |
| Transport | €95 | €1,140 |
| Subscriptions | €64 | €768 |
| Savings | €800 | €9,600 |
| Fun | €300 | €3,600 |

> [!tip]
> Subscriptions: cancel the second music service. Keep the newspaper.

Kitchen money comes out of savings, see [[Kitchen renovation]].
`,
    { parentId: finances },
  );
  await page(
    "Studio finances",
    `
Notes for the accountant meeting.

- VAT due on the 31st ([[File quarterly VAT]])
- Fernweh is 60% of revenue this quarter. Too much from one client.
- Software costs: €212/month. Figma is most of it.

\`\`\`text
Revenue Q3     €61,400
Costs Q3       €43,200
Margin         29.6%
\`\`\`
`,
    { parentId: finances },
  );
  const home = await folder("Home", areas);
  await page(
    "Plants",
    `
| Plant | Water | Last repotted |
| --- | --- | --- |
| Monstera | Weekly | Spring |
| Fiddle leaf fig | When dry | Never (it hates me) |
| Pothos | Weekly | Last autumn |
| Basil | Daily, kitchen window | n/a |
`,
    { parentId: home },
  );
  await page(
    "Packing list",
    `
The list I copy for every trip.

## Always

- [ ] Passport / ID
- [ ] Charger, adapter, headphones
- [ ] Running shoes
- [ ] Book (one, not three)

## Work trips

- [ ] Laptop + clicker
- [ ] Slides exported as PDF, on a USB stick too
`,
    { parentId: home },
  );

  // ---- Recipes

  const recipes = await folder("Recipes");
  await page(
    "Weeknight tomato pasta",
    `
Twenty minutes, one pan. Serves 2.

## Ingredients

- 200 g spaghetti
- 4 tbsp olive oil, 3 cloves garlic (sliced)
- 1 tin of cherry tomatoes
- Chilli flakes, salt, a handful of basil

## Method

1. Start the pasta.
2. Garlic in the oil on low heat until just golden. Chilli for 10 seconds.
3. Tomatoes in, crush half of them, simmer 8 minutes.
4. Pasta in with a splash of the water. Toss for a minute. Basil.

> [!tip]
> Salt the pasta water properly. It's most of the seasoning ([[Salt, Fat, Acid, Heat]]).
`,
    { parentId: recipes, properties: { tags: ["dinner", "quick"], time: "20 min", servings: 2 } },
  );
  await page(
    "Sourdough schedule",
    `
For a loaf on Saturday morning.

| When | Step |
| --- | --- |
| Thu 21:00 | Feed starter |
| Fri 09:00 | Mix levain |
| Fri 13:00 | Mix dough, autolyse 1 h |
| Fri 14:00–17:00 | Four sets of folds |
| Fri 18:00 | Shape, into the fridge |
| Sat 08:00 | Bake 250 °C, 20 min lid on, 25 min off |

Hydration 75%: 500 g flour, 375 g water, 100 g levain, 10 g salt.
`,
    { parentId: recipes, properties: { tags: ["baking"], time: "2 days" } },
  );
  await page(
    "Lentil soup",
    `
The one Sam asks for every week in winter.

- 1 onion, 2 carrots, 2 celery sticks, chopped small
- 250 g red lentils, 1 tin of tomatoes, 1.2 l stock
- Cumin, smoked paprika, lemon at the end

Sweat the vegetables 10 minutes, add everything else, simmer 25. Blend half.
`,
    { parentId: recipes, properties: { tags: ["dinner", "batch"], time: "40 min", servings: 6 } },
  );

  return { documents, databases };
}
