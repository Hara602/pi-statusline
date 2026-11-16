/**
 * Segments: pure functions from state to plain text.
 * Styling is applied once in render.ts, so a segment never embeds ANSI codes.
 */

import { basename } from "node:path";
import type { StatuslineConfig } from "./config.ts";
import type { StatusContext } from "./types.ts";

export interface Segment {
	id: string;
	label: string;
	render(state: SegmentState): string | undefined;
}

export interface SegmentState {
	config: StatuslineConfig;
	context: StatusContext;
	branch: string | null;
	statuses: ReadonlyMap<string, string>;
	now: Date;
	working: boolean;
}

export function shortenPath(path: string): string {
	const home = process.env.HOME;
	if (home && (path === home || path.startsWith(`${home}/`))) {
		return `~${path.slice(home.length)}`;
	}
	return path;
}

export function formatCount(value: number): string {
	if (!Number.isFinite(value)) return "0";
	if (value < 1000) return String(Math.round(value));
	if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}M`;
}

function usageOf(message: { usage?: unknown } | undefined): { input?: number; output?: number; cost?: number } | undefined {
	if (!message || typeof message.usage !== "object" || message.usage === null) return undefined;
	const u = message.usage as Record<string, unknown>;
	const cost = u.cost;
	const costTotal = typeof cost === "object" && cost !== null
		? (cost as Record<string, unknown>).total
		: undefined;
	return {
		input: typeof u.input === "number" ? u.input : undefined,
		output: typeof u.output === "number" ? u.output : undefined,
		cost: typeof costTotal === "number" ? costTotal : undefined,
	};
}

export function totals(state: SegmentState): { input: number; output: number; cost: number } {
	let input = 0;
	let output = 0;
	let cost = 0;
	for (const entry of state.context.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
		const usage = usageOf(entry.message);
		input += usage?.input ?? 0;
		output += usage?.output ?? 0;
		cost += usage?.cost ?? 0;
	}
	return { input, output, cost };
}

export const SEGMENTS: Segment[] = [
	{
		id: "cwd",
		label: "working directory",
		render: ({ context }) => shortenPath(context.cwd) || basename(context.cwd),
	},
	{
		id: "git",
		label: "git branch",
		render: ({ branch, config }) => {
			if (!branch) return undefined;
			const glyph = config.nerd ? "\ue0a0 " : "";
			return `${glyph}${branch}`;
		},
	},
	{
		id: "model",
		label: "model",
		render: ({ context }) => context.model?.id ?? "no-model",
	},
	{
		id: "thinking",
		label: "thinking level",
		render: ({ context }) => context.thinkingLevel ?? undefined,
	},
	{
		id: "context",
		label: "context usage",
		render: ({ context }) => {
			const usage = context.getContextUsage();
			const window = usage?.contextWindow ?? context.model?.contextWindow;
			if (!usage || usage.percent === null || !window) return undefined;
			return `ctx ${Math.round(usage.percent)}%/${formatCount(window)}`;
		},
	},
	{
		id: "tokens",
		label: "session tokens",
		render: (state) => {
			const { input, output } = totals(state);
			return `↑${formatCount(input)} ↓${formatCount(output)}`;
		},
	},
	{
		id: "cost",
		label: "session cost",
		render: (state) => `$${totals(state).cost.toFixed(3)}`,
	},
	{
		id: "clock",
		label: "local time",
		render: ({ now }) => now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
	},
	{
		id: "state",
		label: "working / idle",
		render: ({ working, config }) => {
			if (working) return config.nerd ? "● working" : "* working";
			return config.nerd ? "✓ idle" : "idle";
		},
	},
];

export const SEGMENT_IDS = SEGMENTS.map((segment) => segment.id);

/** Default left/right groups per preset. */
export function groupsFor(config: StatuslineConfig): { left: string[]; right: string[] } {
	const left = ["cwd", "git"];
	const right = config.preset === "minimal"
		? ["model"]
		: config.preset === "compact"
			? ["model", "context", "tokens", "state"]
			: ["model", "thinking", "context", "tokens", "cost", "clock", "state"];
	return { left, right };
}
