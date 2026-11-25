import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { braxUi } from "./vite.js";

/* The sample pages (index.html for the values and theme, parts.html for the parts) are the tester's evidence. With
   HUB_PROTOTYPE set (.env.example) to the folder of the owner's prototype, the dev server also serves that folder at
   /prototype/, so Components.dc.html opens beside the samples from one server, and serves the prototype's two
   @font-face rules (its licensed faces, as data URIs) at /prototype-fonts.css so the samples show them. Nothing of
   the prototype is copied or built into the kit. */
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
};

function servePrototype(folder) {
  const base = normalize(folder);
  return {
    name: "hub-prototype",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split("?")[0];
        if (url === "/prototype-fonts.css") {
          try {
            const hub = await readFile(join(base, "hub.css"), "utf8");
            const faces = hub.split("\n").filter((l) => l.startsWith("@font-face")).join("\n");
            res.setHeader("Content-Type", types[".css"]);
            return res.end(`/* the prototype's licensed faces, served from ${base}, not from the kit */\n${faces}\n`);
          } catch { return next(); }
        }
        if (!url.startsWith("/prototype/")) return next();
        const path = normalize(join(base, decodeURIComponent(url.slice("/prototype".length))));
        if (!path.startsWith(base)) return next();
        try {
          if (!(await stat(path)).isFile()) return next();
          res.setHeader("Content-Type", types[extname(path).toLowerCase()] ?? "application/octet-stream");
          res.end(await readFile(path));
        } catch { next(); }
      });
    },
  };
}

/* The kit's own pages take Tailwind and the build settings the way an app does, through braxUi() (vite.js): the
   browsers the colour math needs are named there. The package file is at the repository's root, one level up, so the
   pages' root is named here. */
const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, here, "HUB_");
  const prototype = env.HUB_PROTOTYPE || process.env.HUB_PROTOTYPE;
  return {
    root: here,
    plugins: [braxUi(), react(), ...(prototype ? [servePrototype(prototype)] : [])],
    build: { rollupOptions: { input: ["index.html", "parts.html", "compare.html"].map((page) => join(here, page)) } },
    server: { port: 4181, strictPort: true },
  };
});
