/* The sections of the parts page (parts.html): one per part or group of parts, each naming the prototype section it
   is compared with. The render test (test/parts.test.mjs) renders every one to static markup without a browser. */
import { AlarmClock, Bell, Building2, CalendarClock, FileText, Folder, Grid3x3, LayoutDashboard, Pencil, Search, Settings, Share, Trash2, Users, WifiOff } from "lucide-react";
import { useState, type ComponentType } from "react";
import {
  Alert, AlertDescription, AppFrame, AppMain, Rail, RailCount, RailItem, RailLabel, Toolbar, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger, AlertTitle, Avatar, Badge, Banner, Breadcrumbs, Button, Card, CardBody, CardDescription, CardFooter, CardHeader, CardTitle, CheckField,
  Checkbox, Chip, Collapsible, CollapsibleContent, CollapsibleTrigger,
  Copyable, CountBadge, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DropdownMenu,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger, EmptyState, Fact, FactGrid, Field,
  FieldError, HelpText, IconButton, Input, Kbd, KeyValue, KeyValueList, Label, Link, Meter, PageHeader, Popover, PopoverContent, PopoverTrigger, Progress, ResizableGroup,
  ResizableHandle, ResizablePanel, Section, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Sheet, SheetBody, SheetContent, SheetHeader,
  SheetTitle, SheetTrigger, Skeleton, SkeletonRows, Slider, StatTile, Switch, TBody, TD, TH, THead, TR, Table, TableFrame, Tabs, TabsContent, TabsList, TabsTrigger, Tag,
  Textarea, Toaster, Toggle, ToggleGroup, ToggleGroupItem, Tooltip, TooltipProvider, toast,
  Calendar, DatePicker, DayItem, DayMore, RailGroup, RailToggle, SeriesSwatch, cn, seriesBg, type DayState, type SeriesNumber,
} from "../parts/index.ts";

export type SectionDef = { title: string; parts: string; prototype?: string; render: ComponentType };

const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;

export const sections: SectionDef[] = [
  {
    title: "Buttons",
    parts: "button: Button (primary, secondary, ghost, link, destructive; md, sm, icon), IconButton, CountBadge",
    prototype: "Buttons",
    render: () => (
      <div className="flex flex-col gap-3">
        <Row>
          <Button variant="primary">Upload</Button>
          <Button>New folder</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary" disabled>Send</Button>
          <Button size="sm">Empty trash</Button>
          <Button variant="link">Review</Button>
          <Button variant="destructive">Move to trash</Button>
        </Row>
        <Row>
          <IconButton aria-label="Share"><Share /></IconButton>
          <IconButton aria-label="Launcher" on><Grid3x3 /></IconButton>
          <IconButton aria-label="Notifications"><Bell /><CountBadge className="absolute top-1 right-0.75">3</CountBadge></IconButton>
          <IconButton aria-label="Edit" size="sm"><Pencil /></IconButton>
          <span className="ml-3 text-small text-ink-3">Square. Primary is the one verb per screen. Hover darkens, no movement.</span>
        </Row>
      </div>
    ),
  },
  {
    title: "Fields and controls",
    parts: "input, textarea, select, label (Label, Field, FieldError, HelpText), checkbox (Checkbox, CheckField), switch",
    prototype: "Fields and controls",
    render: () => (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field><Label htmlFor="p-name">Name</Label><Input id="p-name" defaultValue="Q4 budget" /></Field>
          <Field><Label htmlFor="p-mail">Placeholder</Label><Input id="p-mail" placeholder="dana@" /></Field>
          <Field><Label htmlFor="p-err">Error</Label><Input id="p-err" aria-invalid="true" defaultValue="wrong" /><FieldError>Wrong username or password.</FieldError></Field>
          <Field>
            <Label htmlFor="p-role">Role</Label>
            <Select defaultValue="editor">
              <SelectTrigger id="p-role"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent><SelectItem value="editor">Editor</SelectItem><SelectItem value="commenter">Commenter</SelectItem><SelectItem value="viewer">Viewer</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field className="col-span-2"><Label htmlFor="p-note">Note</Label><Textarea id="p-note" placeholder="What changed" /><HelpText>The submission or receipt number the authority gave.</HelpText></Field>
        </div>
        <Row>
          <Switch defaultChecked aria-label="On" /><Switch aria-label="Off" />
          <CheckField defaultChecked>Notify people</CheckField>
          <Checkbox aria-label="Unchecked" />
          <Checkbox disabled aria-label="Disabled" />
        </Row>
      </div>
    ),
  },
  {
    title: "Chips, segmented controls and tabs",
    parts: "toggle (Toggle, Chip), toggle-group, tabs",
    prototype: "Chips and tabs",
    render: () => (
      <div className="flex flex-col gap-4">
        <Row>
          <Toggle defaultPressed aria-label="All apps">All apps</Toggle><Toggle>Mail</Toggle><Toggle>Files</Toggle><Chip>Docs</Chip><Chip>Past week</Chip>
        </Row>
        <ToggleGroup type="single" defaultValue="light" className="w-70" aria-label="Theme">
          <ToggleGroupItem value="light">Light</ToggleGroupItem><ToggleGroupItem value="dark">Dark</ToggleGroupItem><ToggleGroupItem value="system">System</ToggleGroupItem>
        </ToggleGroup>
        <Tabs defaultValue="all">
          <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="mentions">Mentions</TabsTrigger><TabsTrigger value="calls">Calls</TabsTrigger><TabsTrigger value="shared">Shared with you</TabsTrigger></TabsList>
          <TabsContent value="all" className="text-small text-ink-3">Tabs are text only, mono caps. The active tab takes the accent as text.</TabsContent>
          <TabsContent value="mentions" className="text-small text-ink-3">Mentions.</TabsContent>
          <TabsContent value="calls" className="text-small text-ink-3">Calls.</TabsContent>
          <TabsContent value="shared" className="text-small text-ink-3">Shared with you.</TabsContent>
        </Tabs>
      </div>
    ),
  },
  {
    title: "Status labels, tags, meters",
    parts: "badge (Badge with ok, warn, risk, info, verified, accent; Tag; CountBadge with accent, neutral, risk, info), progress (Progress, Meter), slider, skeleton, separator",
    prototype: "Status and storage",
    render: () => (
      <div className="flex flex-col gap-4">
        <Row>
          <Badge dot tone="ok">Working</Badge><Badge dot tone="warn">Needs a look</Badge><Badge dot tone="risk">Not working</Badge><Badge dot tone="accent">Asks for you</Badge><Badge>Neutral</Badge><Badge variant="outline">Outline</Badge>
          <Tag>Work</Tag><Tag>Kitchen renovation</Tag><CountBadge>9</CountBadge>
        </Row>
        <Row>
          <Badge dot tone="info">Open</Badge><Badge dot tone="verified">Verified</Badge><Badge tone="info">Queued</Badge><Badge tone="verified">Owner</Badge>
          <span className="flex items-center gap-2 text-small text-ink-3">Counts: <CountBadge tone="neutral">12</CountBadge><CountBadge tone="risk">2</CountBadge><CountBadge tone="info">4</CountBadge><CountBadge>9</CountBadge></span>
          <span className="text-small text-ink-3">Info is open or under way; verified is checked by a person. The red count is what is overdue.</span>
        </Row>
        <div className="flex flex-col gap-2">
          <Meter segments={[{ value: 18 }, { value: 12, tone: "ink-3" }, { value: 5, tone: "ink-4" }, { value: 1, tone: "line" }]} aria-label="Storage" /><span className="text-small text-ink-3">18.4 GB used · 3.3 TB free</span>
          <Progress value={92} tone="warn" aria-label="92 percent" /><span className="text-small text-ink-3">46 GB of 50 GB used</span>
          <Progress value={100} tone="risk" aria-label="Full" /><span className="text-small text-accent-text">50 GB of 50 GB used</span>
          <Progress value={40} tone="accent" aria-label="Uploading" />
        </div>
        <Slider defaultValue={[35]} max={100} step={1} aria-label="Volume" className="max-w-70" />
        <div className="flex flex-col gap-2"><Skeleton className="w-2/5" /><Skeleton className="h-2 w-1/5" /></div>
        <Separator />
      </div>
    ),
  },
  {
    title: "Rows and tables",
    parts: "table (TableFrame, Table, THead, TBody, TR, TH, TD, SkeletonRows; shadcn names too)",
    prototype: "Rows",
    render: () => (
      <TableFrame>
        <Table>
          <THead><TR><TH>Name</TH><TH>Owner</TH><TH>Modified</TH><TH align="right">Size</TH><TH>State</TH></TR></THead>
          <TBody>
            <TR clickable><TD><span className="flex items-center gap-3.5"><Folder className="size-icon shrink-0" aria-hidden /><span className="font-display font-strong text-title tracking-row-title">Contracts</span></span></TD><TD className="text-ink-3">You</TD><TD className="text-ink-3">Oct 18</TD><TD align="right" mono className="text-ink-3">—</TD><TD><Badge dot tone="ok">Synced</Badge></TD></TR>
            <TR clickable data-state="selected"><TD><span className="font-display font-strong text-title tracking-row-title">Q4 budget</span></TD><TD className="text-ink-3">You</TD><TD className="text-ink-3">12 min ago</TD><TD align="right" mono className="text-ink-3">48 KB</TD><TD><Badge dot tone="warn">Shared</Badge></TD></TR>
            <TR off><TD>Old invoices.zip</TD><TD className="text-ink-3">Alex</TD><TD className="text-ink-3">Sep 2</TD><TD align="right" mono>1.2 MB</TD><TD><Badge>In trash</Badge></TD></TR>
            <SkeletonRows columns={5} rows={1} />
          </TBody>
        </Table>
      </TableFrame>
    ),
  },
  {
    title: "Notices, toasts, empty states",
    parts: "alert (Alert, EmptyState, Banner, Link), toast (Toaster, toast), sonner (SonnerToaster)",
    prototype: "Notices, toasts, empty states",
    render: () => (
      <div className="flex flex-col gap-3.5">
        <Alert>Items in Trash are deleted forever after 30 days.</Alert>
        <Alert tone="accent" action={<Link>Review</Link>}>2 people asked for access</Alert>
        <Alert tone="info">Account numbers are entered by an owner or an admin.</Alert>
        <Alert tone="warn">Storage is 92% full: 46 GB of 50 GB.</Alert>
        <Alert tone="risk"><AlertTitle>Storage is full</AlertTitle><AlertDescription>Uploads are paused and new mail is not being received.</AlertDescription></Alert>
        <Row>
          <Button size="sm" onClick={() => toast.show({ title: "Moved “Old invoices.zip” to Trash", action: { label: "Undo", onClick: () => {} } })}>Show a toast</Button>
          <Button size="sm" onClick={() => toast.error("Could not save", "The hub did not answer.")}>Show an error toast</Button>
        </Row>
        <Toaster />
        <div className="border border-line"><EmptyState compact>Trash is empty.</EmptyState></div>
        <div className="border border-line"><EmptyState compact action={<Button>Clear filters</Button>}>No files match these filters.</EmptyState></div>
      </div>
    ),
  },
  {
    title: "Menus, popovers, tooltips",
    parts: "dropdown-menu, popover, tooltip (Tooltip, TooltipContent); command (CommandDialog) opens from the button at the top of this page",
    prototype: "Menus, sheets, selection",
    render: () => (
      <TooltipProvider>
        <Row>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button>Open menu</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem><Share />Share</DropdownMenuItem>
              <DropdownMenuItem>Copy link</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>More</DropdownMenuLabel>
              <DropdownMenuItem><Pencil />Rename<DropdownMenuShortcut>N</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuItem>Version history</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive><Trash2 />Move to trash<DropdownMenuShortcut>Del</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Popover>
            <PopoverTrigger asChild><Button>Open popover</Button></PopoverTrigger>
            <PopoverContent className="flex flex-col gap-2"><span className="font-mono text-small uppercase tracking-caps text-ink-3">Brax services</span><span className="flex items-center gap-2"><Badge dot tone="ok">Brax Nexus</Badge><span className="text-small text-ink-3">All services running</span></span></PopoverContent>
          </Popover>
          <Tooltip label="Search everything"><IconButton aria-label="Search"><Search /></IconButton></Tooltip>
        </Row>
      </TooltipProvider>
    ),
  },
  {
    title: "Sheets and confirmations",
    parts: "dialog (the right-hand sheet), sheet, alert-dialog (the bottom sheet)",
    prototype: "Menus, sheets, selection",
    render: () => (
      <Row>
        <Dialog>
          <DialogTrigger asChild><Button variant="primary">Share “Q4 budget”</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Share “Q4 budget”</DialogTitle><DialogDescription>Only the people you add can open it.</DialogDescription></DialogHeader>
            <DialogBody>
              <Field><Label htmlFor="d-people">Add people</Label><Input id="d-people" placeholder="Name or address" /></Field>
              <Field><Label>General access</Label><span className="text-small text-ink-3">Only the people above can open it.</span></Field>
            </DialogBody>
            <DialogFooter><Button variant="ghost" size="sm">Cancel</Button><Button variant="primary" size="sm">Done</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild><Button>Wide sheet, from the left</Button></SheetTrigger>
          <SheetContent side="start" wide>
            <SheetHeader><SheetTitle>Trust Elena Novak's key?</SheetTitle></SheetHeader>
            <SheetBody><p className="text-ink-3">Check the key really belongs to Elena. Trust the key only if every group matches.</p></SheetBody>
          </SheetContent>
        </Sheet>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button variant="destructive">Empty trash</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Empty trash?</AlertDialogTitle><AlertDialogDescription>All 2 items are deleted forever. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction>Empty trash</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Row>
    ),
  },
  {
    title: "People, keys, banners",
    parts: "avatar, kbd, copyable, alert (Banner)",
    prototype: "People, keys, banners",
    render: () => (
      <TooltipProvider>
        <div className="flex flex-col gap-4">
          <Row>
            <Avatar name="Dana Smith" accent /><Avatar name="Alex Smith" /><Avatar name="Jo Lee" /><Avatar name="Pat Singh" /><Avatar name="Dana Smith" accent size="lg" />
            <Kbd>/</Kbd><Kbd>?</Kbd><Kbd>Esc</Kbd><Kbd>G then F</Kbd>
            <Copyable value="BRX3-7F2A-91C4-00AD" />
          </Row>
          <Banner icon={<WifiOff aria-hidden />} action={<Link>Try again</Link>} className="border border-line">You are offline. Changes are saved on this device and sync when the connection is back.</Banner>
        </div>
      </TooltipProvider>
    ),
  },
  {
    title: "Cards",
    parts: "card (Card, CardHeader, CardTitle, CardDescription, CardBody or CardContent, CardFooter, StatTile)",
    render: () => (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-4">
          <StatTile label="Entities" value="12" subtitle="Not dissolved" icon={<Building2 aria-hidden />} />
          <StatTile label="Overdue" value="2" subtitle="Past their date" icon={<AlarmClock aria-hidden />} tone="risk" />
          <StatTile label="Due soon" value="5" subtitle="Next 30 days" icon={<CalendarClock aria-hidden />} tone="warn" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <StatTile label="Open" value="7" subtitle="Filings not yet lodged" tone="info" />
          <StatTile label="Verified" value="31" subtitle="Documents checked" tone="verified" />
        </div>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Storage</CardTitle><Link>Manage</Link></CardHeader>
          <CardBody className="flex flex-col gap-2"><Meter segments={[{ value: 37 }, { value: 24, tone: "ink-3" }]} aria-label="Storage" /><CardDescription>18.4 GB used · 3.3 TB free</CardDescription></CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Messenger</CardTitle></CardHeader>
          <CardBody>Alex Smith sent you a message.</CardBody>
          <CardFooter><Button size="sm" variant="primary">Reply</Button><Button size="sm" variant="ghost">Mark read</Button></CardFooter>
        </Card>
      </div>
      </div>
    ),
  },
  {
    title: "Page frame",
    parts: "page (PageHeader, Section, Breadcrumbs, KeyValueList, KeyValue, Fact, FactGrid)",
    prototype: "Header pieces",
    render: () => (
      <div className="flex flex-col gap-8 border border-line p-8">
        <Breadcrumbs items={[{ label: "Hub admin", href: "#" }, { label: "People", href: "#" }, { label: "Dana Smith" }]} />
        <PageHeader eyebrow="Your account" title="Dana Smith" description="What the hub knows about you, and the devices signed in." actions={<><Button>Export</Button><Button variant="primary">Save</Button></>} />
        <Section title="Profile" description="Shown to the people of this hub.">
          <KeyValueList>
            <KeyValue label="Name" actions={<Link>Change</Link>}>Dana Smith<span className="text-small text-ink-3">dana on smith.brax.network</span></KeyValue>
            <KeyValue label="Phone" actions={<Link>Add</Link>}><span className="text-ink-3">Not set</span></KeyValue>
          </KeyValueList>
        </Section>
        <Section title="Device">
          <FactGrid><Fact label="Model">Brax Phone 2</Fact><Fact label="Serial" mono>BRX3-7F2A-91C4</Fact><Fact label="Enrolled">12 October 2026</Fact><Fact label="Last seen">{null}</Fact></FactGrid>
        </Section>
      </div>
    ),
  },
  {
    title: "App frame",
    parts: "app-frame (AppFrame, Rail, RailLabel, RailItem, RailCount, AppMain, Toolbar)",
    prototype: "App rail",
    render: () => (
      <AppFrame className="h-90 min-h-0 border border-line">
        <Rail aria-label="Mail folders (example)">
          <RailLabel className="pt-0">Mail</RailLabel>
          <RailItem on><Folder />Inbox<RailCount>4</RailCount></RailItem>
          <RailItem><AlarmClock />Snoozed</RailItem>
          <RailItem asChild><a href="#sent"><Share />Sent</a></RailItem>
          <RailLabel>Labels</RailLabel>
          <RailItem>Work<RailCount>3</RailCount></RailItem>
        </Rail>
        <AppMain className="gap-4 p-6">
          <Toolbar aria-label="Inbox (example)"><Input className="max-w-80" aria-label="Search the inbox" placeholder="Search" /><Button size="sm">Mark all read</Button></Toolbar>
          <Skeleton className="w-3/5" /><Skeleton className="w-2/5" />
        </AppMain>
      </AppFrame>
    ),
  },
  {
    title: "A rail that collapses",
    parts: "app-frame (Rail with collapsed and onCollapsedChange, RailToggle, RailGroup, RailCount with a tone)",
    prototype: "App rail",
    render: () => (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-4">
          <CollapsingRail />
          <CollapsingRail startCollapsed />
        </div>
        <p className="text-small text-ink-3">The app holds whether the rail is open; the button asks it to change. As icons, each item shows its words in a tooltip and keeps its name for a screen reader; a plain count is dropped and the red one becomes a dot. A group's label opens and closes it.</p>
      </div>
    ),
  },
  {
    title: "Chart colours",
    parts: "series (seriesBg, seriesFill, seriesStroke, SeriesSwatch), progress (Meter with series); the values --series-1 to --series-6 and --on-series",
    render: () => <ChartColours />,
  },
  {
    title: "Calendar and date picker",
    parts: "calendar (CalendarGrid, Calendar, DayItem, DayMore), date-picker (DatePicker); lib/dates",
    render: () => <Calendars />,
  },
  {
    title: "Collapsible and resizable",
    parts: "collapsible, resizable",
    render: () => (
      <div className="flex flex-col gap-4">
        <Collapsible>
          <CollapsibleTrigger asChild><Button size="sm">Show details</Button></CollapsibleTrigger>
          <CollapsibleContent className="mt-3 text-small text-ink-3">Three devices, two phones and a laptop, enrolled since October.</CollapsibleContent>
        </Collapsible>
        <div className="h-40 border border-line">
          <ResizableGroup orientation="horizontal">
            <ResizablePanel defaultSize={40} className="p-4 text-small text-ink-3">Rules</ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className="p-4 text-small text-ink-3">The rule's editor</ResizablePanel>
          </ResizableGroup>
        </div>
      </div>
    ),
  },
];

function CollapsingRail({ startCollapsed = false }: { startCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(startCollapsed);
  return (
    <AppFrame className="h-90 min-h-0 border border-line">
      <Rail aria-label={startCollapsed ? "Records, as icons (example)" : "Records (example)"} collapsed={collapsed} onCollapsedChange={setCollapsed}>
        <RailToggle label={collapsed ? "Open the menu" : "Collapse the menu"} />
        <RailItem on><LayoutDashboard />Dashboard</RailItem>
        <RailGroup label="Records">
          <RailItem><Building2 />Entities<RailCount>12</RailCount></RailItem>
          <RailItem><CalendarClock />Deadlines<RailCount tone="danger">2</RailCount></RailItem>
          <RailItem asChild><a href="#filings"><FileText />Filings</a></RailItem>
        </RailGroup>
        <RailGroup label="Settings" defaultOpen={false}>
          <RailItem><Users />Members</RailItem>
          <RailItem><Settings />Workspace</RailItem>
        </RailGroup>
      </Rail>
      <AppMain className="gap-4 p-6">
        <Skeleton className="w-3/5" /><Skeleton className="w-2/5" />
      </AppMain>
    </AppFrame>
  );
}

/* Plain sample data: who holds what of a made-up company, issued and with options counted in. */
type Holder = { name: string; issued: number; diluted: number; series: SeriesNumber | "rest" };
const holders: Holder[] = [
  { name: "Dana Smith", issued: 42, diluted: 36, series: 1 },
  { name: "Alex Smith", issued: 23, diluted: 20, series: 2 },
  { name: "Jo Lee", issued: 14, diluted: 13, series: 3 },
  { name: "Pat Singh", issued: 9, diluted: 9, series: 4 },
  { name: "Sam Okafor", issued: 6, diluted: 7, series: 5 },
  { name: "Kim Tran", issued: 4, diluted: 5, series: 6 },
  { name: "3 others", issued: 2, diluted: 10, series: "rest" },
];
const weekly = [3, 5, 2, 8, 6, 4, 7];

function ChartColours() {
  const bars = [{ label: "Issued", value: (h: Holder) => h.issued }, { label: "Fully diluted", value: (h: Holder) => h.diluted }];
  const fill = (s: SeriesNumber | "rest") => (s === "rest" ? "bg-line-strong text-ink-1" : cn(seriesBg[s - 1], "text-on-series"));
  return (
    <div className="flex flex-col gap-5">
      <Row>
        {([1, 2, 3, 4, 5, 6] as const).map((n) => (
          <span key={n} className={cn("flex h-control w-20 items-center justify-center font-mono text-small text-on-series", seriesBg[n - 1])}>{n}</span>
        ))}
        <span className="flex h-control w-20 items-center justify-center bg-line-strong font-mono text-small text-ink-1">others</span>
      </Row>
      <p className="max-w-180 text-small text-ink-3">Six, in order, computed from the hub's accent: series 1 is its hue, the rest are that hue turned a sixth of the circle at a time, and neighbours alternate between a lighter and a darker step so that they stay apart without their hue. Pick another accent at the top of the page and they follow.</p>
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-col gap-1.5">
          <span className="text-small text-ink-3">{bar.label}</span>
          <div role="img" aria-label={bar.label + ": " + holders.map((h) => h.name + " " + bar.value(h) + "%").join(", ")} className="flex h-7 w-full gap-0.5">
            {holders.map((h) => (
              <div key={h.name} className={cn("flex h-full min-w-0 items-center overflow-hidden px-1.5 font-mono text-small tabular-nums", fill(h.series))} style={{ width: bar.value(h) + "%" }}>
                {bar.value(h) >= 9 ? bar.value(h) + "%" : null}
              </div>
            ))}
          </div>
        </div>
      ))}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {holders.map((h) => (
          <li key={h.name} className="flex items-center gap-2 text-body">
            <SeriesSwatch series={h.series} />
            <span className="min-w-0 flex-1 truncate">{h.name}</span>
            <span className="font-mono text-small text-ink-3 tabular-nums">{h.issued}% issued · {h.diluted}% diluted</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <Meter segments={[{ value: 42, series: 1 }, { value: 23, series: 2 }, { value: 14, series: 3 }, { value: 9, tone: "line" }]} aria-label="Shares: Dana Smith 42%, Alex Smith 23%, Jo Lee 14%, others 9%" />
        <span className="text-small text-ink-3">The meter takes a series for a segment.</span>
      </div>
      <div className="flex flex-col gap-2">
        <div role="img" aria-label="Filings a day this week: 3, 5, 2, 8, 6, 4, 7; Thursday, 8, is the day in front" className="flex h-24 items-end gap-2">
          {weekly.map((n, i) => <i key={i} className={cn("block w-10", i === 3 ? "bg-accent" : "bg-line-strong")} style={{ height: n * 12 + "%" }} />)}
        </div>
        <span className="text-small text-ink-3">One series is not coloured by series: grey bars, and the accent for the one in front.</span>
      </div>
    </div>
  );
}

/* Plain sample data: what falls due in November 2026. */
const due: Record<string, { title: string; tone: "risk" | "warn" | "info" | "ok" | "neutral" }[]> = {
  "2026-11-03": [{ title: "Annual return", tone: "ok" }],
  "2026-11-12": [{ title: "VAT return, Q3", tone: "risk" }],
  "2026-11-26": [{ title: "Board minutes", tone: "warn" }, { title: "Payroll filing", tone: "info" }, { title: "Lease renewal", tone: "info" }, { title: "Licence fee", tone: "neutral" }],
  "2026-11-30": [{ title: "Tax instalment", tone: "info" }],
  "2026-12-01": [{ title: "Insurance renewal", tone: "info" }],
};

function Calendars() {
  const [picked, setPicked] = useState<string>("2026-11-18");
  const [day, setDay] = useState<string | null>("2026-11-12");
  const cell = ({ date }: DayState) => {
    const items = due[date] ?? [];
    return (
      <>
        {items.slice(0, 3).map((it) => <DayItem key={it.title} tone={it.tone}>{it.title}</DayItem>)}
        {items.length > 3 ? <DayMore>{items.length - 3} more</DayMore> : null}
      </>
    );
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[auto_1fr] items-start gap-8">
        <div className="flex flex-col gap-4">
          <Field className="w-60"><Label htmlFor="p-due">Due on</Label><DatePicker id="p-due" name="due_on" value={picked} onValueChange={setPicked} today="2026-11-26" min="2026-01-01" /><HelpText>Typed year first, or picked from the month.</HelpText></Field>
          <div className="border border-line p-3">
            <Calendar selected={picked || null} onSelect={setPicked} defaultMonth="2026-11" today="2026-11-26" isMarked={(date) => date in due} weekNumbers />
          </div>
        </div>
        <div className="flex flex-col gap-2 text-small text-ink-3">
          <p>The small month: today is filled with the accent, the day chosen has the accent frame, a day of another month is dim, a dot marks a day that holds something. With the keyboard on a day: the arrows move by a day and a week, Home and End to the ends of the week, Page Up and Page Down by a month (with Shift, a year), Enter chooses.</p>
          <p>Chosen: <span className="font-mono text-ink-1">{picked || "none"}</span></p>
        </div>
      </div>
      <div className="border border-line">
        <Calendar size="month" defaultMonth="2026-11" today="2026-11-26" selected={day} onSelect={setDay} todayLabel="Today" renderDay={cell} />
      </div>
    </div>
  );
}
