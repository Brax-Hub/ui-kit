/* Brax Hub UI kit: what an app's vite.config adds, in one call (ui/README.md "Taking the UI kit into an app").

     import { braxUi } from '@brax-hub/ui/vite'
     plugins: [braxUi(), ...]

   It brings the kit's own Tailwind (one version for every app, so one theme), and sets the three things the kit's
   stylesheet and parts need from a build:
   - Tailwind's optimiser off and the CSS target named, so the build keeps light-dark() and the relative colours as
     written. Compiled down for older browsers, the accent's shades would be worked out at build time from the default
     accent and would no longer follow the accent the hub's owner picks.
   - The parts are TypeScript source inside node_modules, so a server-rendering build has to compile them with the app
     instead of leaving them for Node to load. */
import tailwindcss from "@tailwindcss/vite";

/* The browsers the colour math needs (ui/README.md "Browser support"). */
export const browsers = ["chrome123", "edge123", "safari17.5", "firefox128"];

export function braxUi() {
  return [
    tailwindcss({ optimize: false }),
    {
      name: "brax-hub-ui",
      config: () => ({ build: { cssTarget: browsers }, ssr: { noExternal: ["@brax-hub/ui"] } }),
    },
  ];
}
