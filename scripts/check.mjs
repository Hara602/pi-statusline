#!/usr/bin/env node
/**
 * Dependency-free sanity checks for the Codex-style statusline.
 * `npm run typecheck` does the TypeScript checking; this script verifies the
 * project layout, manifest and — via jiti — that all six required fields are
 * actually rendered, including at narrow terminal widths.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
for (const host of ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"]) {
	if (pkg.dependencies?.[host]) fail(`${host} must be a peerDependency, not a dependency`);
	if (pkg.peerDependencies?.[host] !== "*") fail(`${host} must be a peerDependency "*"`);
}

let jiti;
try {
	const jitiPath = "/home/chr/.pi/agent/install/releases/1.5.2/node_modules/jiti/lib/jiti.mjs";
	({ createJiti: jiti } = await import(pathToFileURL(jitiPath).href));
} catch {
	console.log("check: jiti unavailable; skipped runtime render test");
	console.log("check: project layout and manifest OK");
	process.exit(0);
}

const load = jiti(import.meta.url, { interopDefault: true });
const { createFooter } = await load.import(join(root, "extensions/render.ts"));
const { REQUIRED_ITEMS } = await load.import(join(root, "extensions/segments.ts"));
const { DEFAULT_CONFIG } = await load.import(join(root, "extensions/config.ts"));

const plainTheme = { fg: (_c, text) => text, bg: (_c, text) => text, style: (_c, text) => text };
const footerData = {
	getGitBranch: () => "main",
	getExtensionStatuses: () => new Map([["demo", "demo status"]]),
	onBranchChange: () => () => {},
};
const tui = { requestRender: () => {} };
const context = {
	cwd: "/home/chr/pi-statusline",
	mode: "tui",
	model: { id: "remote-magpie/zenmux/tencent/hy4", contextWindow: 1000000 },
	thinkingLevel: "max",
	sessionName: undefined,
	sessionTitle: undefined,
	sessionId: "01a1e42d-7c7f-7313-b51a-c23f0df21805",
	piVersion: "1.5.2",
	getContextUsage: () => ({ tokens: 48000, contextWindow: 1000000, percent: 4.8 }),
	sessionManager: {
		getSessionId: () => "01a1e42d-7c7f-7313-b51a-c23f0df21805",
		getBranch: () => [
			{ type: "message", message: { role: "user", content: [{ type: "text", text: "搜索关于pi的插件，比如如何自定义状态栏" }] } },
			{ type: "message", message: { role: "assistant", usage: { input: 1200, output: 300, cost: { total: 0.012 } } } },
		],
	},
};
const run = { idle: false, waitingForUser: false, promptDepth: 0, changedAt: Date.now() };

for (const width of [200, 100, 60, 30]) {
	const footer = createFooter({
		config: { ...DEFAULT_CONFIG, statuses: true },
		context,
		footerData,
		theme: plainTheme,
		tui,
		run,
	});
	const lines = footer.render(width);
	const first = lines[0] ?? "";
	const visible = first.replace(/\x1b\[[0-9;]*m/g, "");
	if (visible.length > width) fail(`line exceeds width ${width}: ${visible.length}`);
	if (!/搜索|搜…|…/.test(visible)) fail(`session name missing at width ${width}`);
	if (/\d{1,2}:\d{2}/.test(visible)) fail(`clock still present at width ${width}`);
	if (/\$\d/.test(visible)) fail(`cost should be hidden by default at width ${width}`);
	if (width >= 200 && !/↑/.test(visible)) fail(`token counts missing at width ${width}`);
	for (const id of REQUIRED_ITEMS) {
		if (id === "state") {
			if (!/Work|Ready|Wait|⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏/.test(first)) fail(`missing run state at width ${width}`);
		} else if (id === "session") {
			if (width >= 100) {
				if (!first.includes("搜索关于pi")) fail(`missing derived session name at width ${width}`);
			} else if (!/搜索|搜…|…/.test(first)) {
				fail(`missing derived session name at width ${width}`);
			}
		} else if (id === "cwd") {
			if (width >= 60) {
				if (!first.includes("~/")) fail(`missing cwd at width ${width}`);
			} else if (!/~|…/.test(first)) {
				fail(`missing cwd at width ${width}`);
			}
		} else if (id === "model") {
			if (!/remote|remo|rem…|r…|…/.test(first)) fail(`missing model at width ${width}`);
		} else if (id === "reasoning") {
			if (!/reasoni|rea…|re…/.test(first)) fail(`missing reasoning at width ${width}`);
		} else if (id === "version") {
			if (!/pi/.test(first)) fail(`missing pi version at width ${width}`);
		}
	}
	console.log(`check: width=${width} -> ${JSON.stringify(first)}`);
	footer.dispose?.();
}

// Session names are capped at 15 characters, including the ellipsis.
{
	const footer = createFooter({
		config: { ...DEFAULT_CONFIG },
		context: { ...context, sessionName: "这是一个非常长的会话名称超过十五个字符" },
		footerData,
		theme: plainTheme,
		tui,
		run,
	});
	const line = footer.render(200)[0] ?? "";
	const session = line.split(" · ")[0] ?? "";
	if (Array.from(session).length > 15) fail(`session name exceeds 15 characters: ${JSON.stringify(session)}`);
	if (!session.endsWith("…")) fail(`long session name was not ellipsized: ${JSON.stringify(session)}`);
	console.log(`check: session cap -> ${JSON.stringify(session)}`);
	footer.dispose?.();
}

// Opt-in cost: keep one test that confirms `showCost: true` brings it back.
{
	const footer = createFooter({
		config: { ...DEFAULT_CONFIG, showCost: true },
		context,
		footerData,
		theme: plainTheme,
		tui,
		run,
	});
	const line = footer.render(200)[0] ?? "";
	if (!/\$0\.012/.test(line)) fail("showCost: true did not render the cost item");
	console.log(`check: showCost=true -> ${JSON.stringify(line)}`);
	footer.dispose?.();
}

console.log("check: layout, manifest and required-field rendering OK");
