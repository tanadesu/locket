import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const html = readFileSync("dist/index.html", "utf8");
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
if (ids.length !== new Set(ids).size) throw Error("Duplicate HTML ids");
const source = readFileSync("dist/game.js", "utf8");
for (const [, id] of source.matchAll(/\$\(['"]([^'"]+)['"]\)/g))
  if (!ids.includes(id)) throw Error("Missing element: " + id);
const scripts = [
  "dist/game.js",
  ...readdirSync("dist/lib")
    .filter((f) => /\.(mjs|js)$/.test(f))
    .map((f) => "dist/lib/" + f),
];
for (const file of scripts) {
  const check = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (check.status !== 0) throw Error(check.stderr);
  for (const [, path] of readFileSync(file, "utf8").matchAll(
    /(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g,
  ))
    if (!existsSync(resolve(dirname(file), path)))
      throw Error("Missing import " + path);
}
for (const [, path] of html.matchAll(/(?:src|href)="([^"#]+)"/g))
  if (path !== "./" && !existsSync(resolve("dist", path)))
    throw Error("Missing asset " + path);
console.log("PASS: JavaScript syntax, UI bindings and local asset references");
