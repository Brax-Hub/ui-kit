/* The parts page: every part of ui/parts in the kit's theme, light and dark, under the seven test accents, each
   section beside the prototype's version where one exists (the prototype's Components page in the right pane,
   scrolled to the matching section). Theme and accent are written on <html> as the hub's theme will write them. */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import accents from "../test/accents.json";
import { Button, Chip, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut, ToggleGroup, ToggleGroupItem } from "../parts/index.ts";
import { sections } from "./sections.tsx";

type Theme = "light" | "dark" | "system";
const html = document.documentElement;
const query = new URLSearchParams(location.search);

function App() {
  const [theme, setTheme] = useState<Theme>((query.get("theme") as Theme) ?? "system");
  const [accent, setAccent] = useState(accents.find((a) => a.hex.slice(1).toLowerCase() === (query.get("accent") ?? "").toLowerCase())?.hex ?? accents[0].hex);
  const [palette, setPalette] = useState(false);
  const [shown, setShown] = useState<string | undefined>();
  const proto = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (theme === "system") html.removeAttribute("data-theme"); else html.dataset.theme = theme;
    paintPrototype();
  }, [theme]);
  useEffect(() => { html.style.setProperty("--accent", accent); }, [accent]);

  // the prototype's page takes its theme as a design prop; write it on its root, as its own avatar menu does
  function paintPrototype() {
    const hub = proto.current?.contentDocument?.querySelector<HTMLElement>(".hub");
    if (hub) hub.dataset.theme = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  }
  function showInPrototype(title?: string) {
    setShown(title);
    const doc = proto.current?.contentDocument;
    if (!doc || !title) return;
    const h = [...doc.querySelectorAll("h2")].find((el) => el.textContent?.trim() === title);
    h?.closest("section")?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="grid min-h-screen grid-cols-[1fr_auto]">
      <main className="flex min-w-0 flex-col gap-10 px-10 pt-10 pb-24">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-small uppercase tracking-caps text-ink-3">Brax Hub · UI kit · FE02</span>
          <h1 className="text-h1">The parts</h1>
          <p className="max-w-180 text-lead text-ink-3">Every part the module kit's app, Feedback, the Guide's admin and Hub administration use, kept once here in the look of the prototype. Pick a theme and an accent; the right pane shows the prototype's Components page, scrolled to the section a part is compared with.</p>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <ToggleGroup type="single" value={theme} onValueChange={(v) => v && setTheme(v as Theme)} className="w-70" aria-label="Theme">
            <ToggleGroupItem value="light">Light</ToggleGroupItem><ToggleGroupItem value="dark">Dark</ToggleGroupItem><ToggleGroupItem value="system">System</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Accent">
            {accents.map((a) => (
              <Chip key={a.hex} on={a.hex === accent} onClick={() => setAccent(a.hex)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setAccent(a.hex)}>
                <i className="inline-block size-dot rounded-pill bg-accent" style={{ ["--accent" as string]: a.hex }} />{a.hex}
              </Chip>
            ))}
          </div>
          <Button size="sm" onClick={() => setPalette(true)}>Open the command palette</Button>
        </div>
        <CommandDialog title="Search" open={palette} onOpenChange={setPalette}>
          <CommandInput placeholder="Search Mail, or everything" />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandGroup heading="Apps">
              <CommandItem onSelect={() => setPalette(false)}>Mail<CommandShortcut>G M</CommandShortcut></CommandItem>
              <CommandItem onSelect={() => setPalette(false)}>Files<CommandShortcut>G F</CommandShortcut></CommandItem>
              <CommandItem onSelect={() => setPalette(false)}>Calendar<CommandShortcut>G C</CommandShortcut></CommandItem>
            </CommandGroup>
            <CommandGroup heading="People">
              <CommandItem onSelect={() => setPalette(false)}>Alex Smith</CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-4.5" data-section={s.title}>
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="inline-block h-tick-h w-tick-w bg-accent" />
              <h2 className="text-h2">{s.title}</h2>
              {s.prototype && (
                <Button variant="link" className="ml-auto" aria-pressed={shown === s.prototype} onClick={() => showInPrototype(s.prototype)}>
                  {shown === s.prototype ? "Shown in the prototype" : `Prototype: ${s.prototype}`}
                </Button>
              )}
            </div>
            <p className="font-mono text-small text-ink-3">{s.parts}</p>
            <s.render />
          </section>
        ))}
      </main>
      <aside className="sticky top-0 hidden h-screen w-180 shrink-0 flex-col border-l border-line bg-bg xl:flex">
        <div className="flex h-control-tall shrink-0 items-center gap-3 border-b border-line px-4 font-mono text-small uppercase tracking-caps text-ink-3">The prototype's Components page{shown ? ` · ${shown}` : ""}</div>
        <iframe ref={proto} title="The prototype's Components page" src={`/prototype/Components.dc.html?theme=${theme === "dark" ? "dark" : "light"}`} onLoad={() => { for (const ms of [0, 300, 1000, 2500]) setTimeout(paintPrototype, ms); }} className="h-[200%] w-360 shrink-0 origin-top-left scale-50 border-0" />
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
