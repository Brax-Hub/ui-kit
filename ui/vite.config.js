import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

/* The sample page (index.html) is the tester's evidence for FE01. With HUB_PROTOTYPE set (.env.example) to the folder
   of the owner's prototype, the dev server also serves that folder at /prototype/, so Components.dc.html opens beside
   the sample from one server, and serves the prototype's two @font-face rules (its licensed faces, as data URIs) at
   /prototype-fonts.css so the sample shows them. Nothing of the prototype is copied or built into the kit. */
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

/* The browsers the colour math needs (README.md). Named here so that the build keeps light-dark() and the relative
   colours as written instead of compiling them down for older browsers; Tailwind's own optimiser is off for the
   same reason, and Vite minifies with these targets. */
const browsers = ["chrome123", "edge123", "safari17.5", "firefox128"];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "HUB_");
  const prototype = env.HUB_PROTOTYPE || process.env.HUB_PROTOTYPE;
  return {
    plugins: [tailwindcss({ optimize: false }), ...(prototype ? [servePrototype(prototype)] : [])],
    build: { cssTarget: browsers },
    server: { port: 4181, strictPort: true },
  };
});
