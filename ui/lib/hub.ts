/* What a module's page links from the hub at run time, after its own stylesheet (ui/README.md "Taking the UI kit
   into an app"). The app's stylesheet carries the kit's values at the version the app pinned, so the page reads
   outside a hub too; inside one, the hub's files come later in the document and win:

   1. the hub's copy of the kit's file of values, so every app on a hub shows the same values;
   2. the hub's theme, one rule that writes the accent its owner picked (contracts TASKS FE03); every shade is
      computed from it in the browser;
   3. the two licensed faces, Kinetika and LFT Etica Mono, which no app carries (TASKS FE08; ../fonts/README.md).

   A page may link same-origin stylesheets only, and a module in its frame is same-origin with the hub, so these are
   paths, not addresses. Outside a hub they answer 404 and the page keeps the kit's defaults and the system faces. */
export const hubStylesheets = ["/hub/assets/ui/values.css", "/hub/assets/theme.css", "/hub/assets/fonts/hub-fonts.css"] as const;

/** The same three as `<link>` descriptors, for a router's head: `links: [{ rel: "stylesheet", href: appCss }, ...hubStylesheetLinks]`. */
export const hubStylesheetLinks = hubStylesheets.map((href) => ({ rel: "stylesheet", href }));
