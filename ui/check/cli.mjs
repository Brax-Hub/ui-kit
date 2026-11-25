#!/usr/bin/env node
/* brax-ui-check [app folder]: exit 1, naming each line, when the app holds a copy of a part or a colour, face,
   radius or length of its own, or does not follow the hub's theme (app.mjs says what is read and what is refused). */
import { resolve } from "node:path";
import { checkApp } from "./app.mjs";

const root = resolve(process.argv[2] ?? ".");
const problems = checkApp(root);
for (const p of problems) console.error(p);
console.log(problems.length ? `ui check: ${problems.length} problem(s). The look comes from @brax-hub/ui; a part that is missing is added to its parts.` : "ui check: the app holds no part and no colour of its own, and follows the hub's theme");
process.exit(problems.length ? 1 : 0);
