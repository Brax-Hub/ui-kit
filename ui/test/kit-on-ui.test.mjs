/* FE04, first half: the business-app kit (the kit for writing modules: kit/, tooling/, templates/,
   docs/design-system/) is on the UI kit. Its "done when" (contracts TASKS FE04): it holds no copy of a part and no
   colour of its own. This file fails when it does:

   - the sample app, kit/example, passes the check every app runs (check/app.mjs): no colour, face, radius or
     length, no part under the kit's name, no parts folder, none of a part's makings, the kit's stylesheet imported
     and the hub's three stylesheets linked;
   - the kit's other pieces that reach a page (the editor-side tooling, the dev stubs, the page in
     docs/design-system) carry no colour, face or part either;
   - no folder of the kit holds a parts folder, and the template of an app's rules tells no app to make one;
   - an app made by kit/init.mjs names the UI kit by its tag and passes the same check;
   - the package an app gets from the tag holds the kit's files and nothing else, and the sample's lock file agrees
     with it. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, sep } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkApp, checkText } from "../check/app.mjs";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const sample = join(repo, "kit", "example");
const rootPackage = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (["node_modules", "dist", ".data", ".tanstack"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path); else yield path;
  }
}
const rel = (path) => relative(repo, path).split(sep).join("/");

test("the sample app holds no part and no colour of its own, and follows the hub's theme", () => {
  assert.deepEqual(checkApp(sample), []);
});

test("the sample app with a colour, or a part, of its own is refused", () => {
  const stylesheet = readFileSync(join(sample, "src", "styles.css"), "utf8");
  assert.match(checkText(`${stylesheet}:root { --accent: #2563eb; }\n`, "kit/example/src/styles.css").join("\n"), /a hex colour, "#2563eb"[\s\S]*a value of the UI kit set again, "--accent"/);
  const screen = readFileSync(join(sample, "src", "routes", "index.tsx"), "utf8");
  assert.match(checkText(`${screen}\nfunction Button() {\n  return null\n}\n`, "kit/example/src/routes/index.tsx").join("\n"), /a part declared under the UI kit's name, "Button"/);
});

test("the kit's tooling, dev stubs and design page carry no colour, face or part", () => {
  const pieces = [...walk(join(repo, "tooling")), ...walk(join(repo, "kit", "dev")), ...walk(join(repo, "docs", "design-system")), ...walk(join(sample, "public"))]
    .filter((path) => [".css", ".html", ".js", ".mjs", ".ts", ".tsx"].includes(extname(path)));
  assert.ok(pieces.some((p) => p.endsWith("dev-inspect.ts")) && pieces.some((p) => p.endsWith("style-guide.html")) && pieces.some((p) => p.endsWith("dev-member.ts")), "the pieces moved; name their new places here");
  const problems = pieces.flatMap((path) => checkText(readFileSync(path, "utf8"), rel(path)));
  // One line is right to set the accent: the stub edge plays the hub, whose theme is the one place an accent is named
  // (and it takes the value from DEV_ACCENT or ?accent=, it writes none). An app never has that file under src/.
  const hubsOwn = /^kit\/dev\/dev-member\.ts:\d+: a value of the UI kit set again, "--accent"$/;
  assert.equal(problems.filter((p) => hubsOwn.test(p)).length, 1, "the stub edge no longer names the hub's accent in one place");
  assert.deepEqual(problems.filter((p) => !hubsOwn.test(p)), []);
});

test("no folder of the kit holds a parts folder, and the rules template asks for none", () => {
  const copies = ["kit", "tooling", "templates", "docs"].flatMap((folder) => [...walk(join(repo, folder))]).map(rel).filter((path) => /(^|\/)components\/ui\/|(^|\/)components\.json$/.test(path));
  assert.deepEqual(copies, [], "a parts folder outside ui/parts");
  const rules = readFileSync(join(repo, "templates", "AI_RULES.md"), "utf8");
  assert.match(rules, /@brax-hub\/ui\/parts/, "the template does not name the UI kit's parts");
  assert.match(rules, /ui-check/, "the template does not name the check");
  assert.doesNotMatch(rules, /shadcn|tokens\.css|app\.css|jetbrains/i, "the template still describes a look of the app's own");
});

test("an app made by kit/init.mjs names the UI kit by its tag and passes the check", () => {
  const target = mkdtempSync(join(tmpdir(), "brax-kit-init-"));
  made.push(target);
  rmSync(target, { recursive: true });
  const env = { ...process.env };
  delete env.UI_KIT_REF;
  const init = spawnSync(process.execPath, [join(repo, "kit", "init.mjs"), "demo", target], { encoding: "utf8", env });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["@brax-hub/ui"], `git+https://github.com/Brax-Hub/ui-kit.git#ui-v${rootPackage.version}`);
  assert.match(pkg.scripts.gate, /npm run ui-check/, "the app's gate does not run the check");
  assert.ok(!existsSync(join(target, ".npmrc")) && !existsSync(join(target, "package-lock.json")), "the sample's .npmrc or lock file went into the app");
  assert.deepEqual(checkApp(target), []);
});

test("the sample app takes the UI kit from this working tree, as a package", () => {
  const pkg = JSON.parse(readFileSync(join(sample, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["@brax-hub/ui"], "file:../..");
  assert.match(readFileSync(join(sample, ".npmrc"), "utf8"), /^install-links=true$/m);
  const locked = JSON.parse(readFileSync(join(sample, "package-lock.json"), "utf8")).packages["node_modules/@brax-hub/ui"];
  assert.equal(locked.version, rootPackage.version, "run `npm install` in kit/example: its lock file names another version of the UI kit");
  assert.deepEqual(locked.dependencies, rootPackage.dependencies, "run `npm install` in kit/example: its lock file names other dependencies of the UI kit");
});

test("the package an app gets holds the kit's files and nothing else", () => {
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: repo, encoding: "utf8", shell: true });
  assert.equal(packed.status, 0, packed.stderr);
  // npm 10 answers a list with one entry, npm 12 an object keyed by the package's name
  const answer = JSON.parse(packed.stdout.slice(packed.stdout.search(/[[{]/)));
  const files = (Array.isArray(answer) ? answer[0] : Object.values(answer)[0]).files.map((f) => f.path);
  const stray = files.filter((path) => !/^(package\.json|README\.md|ui\/(values|theme|ui)\.css|ui\/vite\.(js|d\.ts)|ui\/README\.md|ui\/(fonts|lib|parts|check)\/[^/]+)$/.test(path));
  assert.deepEqual(stray, [], "a file that is not the kit's is in the package");
  for (const need of ["ui/values.css", "ui/theme.css", "ui/ui.css", "ui/vite.js", "ui/lib/cn.ts", "ui/lib/hub.ts", "ui/parts/index.ts", "ui/parts/app-frame.tsx", "ui/check/cli.mjs", "ui/check/app.mjs", "ui/check/literals.mjs"]) {
    assert.ok(files.includes(need), `${need} is not in the package`);
  }
  // npm prepares a git dependency that has one of these scripts by running a whole install of it, with its
  // development dependencies, inside every app's install (pacote, git.js). The kit ships source, so it has none:
  // its pages are built by "pages", not "build".
  const prepares = ["preinstall", "install", "postinstall", "prepack", "prepare", "build"].filter((name) => rootPackage.scripts[name]);
  assert.deepEqual(prepares, [], "a script that makes npm prepare the kit inside each app's install");
  for (const target of Object.values(rootPackage.exports).map((e) => (typeof e === "string" ? e : e.default))) {
    if (target.includes("*")) continue;
    assert.ok(existsSync(join(repo, target)), `package.json exports ${target}, which does not exist`);
  }
});

test("the stub edge answers the three stylesheets a page links, and the README names this version's tag", () => {
  const linked = [...readFileSync(join(repo, "ui", "lib", "hub.ts"), "utf8").match(/hubStylesheets = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(linked.length, 3);
  const stub = readFileSync(join(repo, "kit", "dev", "dev-member.ts"), "utf8");
  for (const path of linked) assert.ok(stub.includes(`'${path}'`), `the stub edge does not answer ${path}`);
  assert.ok(readFileSync(join(repo, "ui", "README.md"), "utf8").includes(`ui-v${rootPackage.version}`), `ui/README.md does not name the tag ui-v${rootPackage.version}`);
});
