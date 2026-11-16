#!/usr/bin/env node
/**
 * Dependency-free sanity check. Pi loads TypeScript through jiti, so this
 * script only validates structure and configuration; `npm run typecheck`
 * does the real TypeScript checking once devDependencies are installed.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const fail = (message) => {
	console.error(`check: ${message}`);
	process.exit(1);
};

for (const path of [
	"package.json",
	"tsconfig.json",
	"extensions/index.ts",
	"extensions/config.ts",
	"extensions/segments.ts",
	"extensions/render.ts",
	"extensions/types.ts",
	"README.md",
	"LICENSE",
	".gitignore",
]) {
	try {
		statSync(join(root, path));
	} catch {
		fail(`missing ${path}`);
	}
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.pi?.extensions?.[0] !== "./extensions/index.ts") {
	fail("package.json: pi.extensions must point to ./extensions/index.ts");
}
for (const hostPackage of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"]) {
	if (pkg.dependencies?.[hostPackage]) {
		fail(`${hostPackage} must be a peerDependency, not a dependency`);
	}
	if (pkg.peerDependencies?.[hostPackage] !== "*") {
		fail(`${hostPackage} must be declared as a peerDependency with "*"`);
	}
}

const entry = readFileSync(join(root, "extensions/index.ts"), "utf8");
if (!entry.includes("export default function")) fail("extension has no default factory export");
if (!entry.includes("ctx.ui.setFooter")) fail("extension never installs a footer");
if (!entry.includes("registerCommand(\"statusline\"")) fail("extension has no /statusline command");

console.log("check: project layout and manifest OK");
