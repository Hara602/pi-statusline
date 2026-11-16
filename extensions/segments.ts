/**
 * Codex-style status line items.
 *
 * Codex's statusline (codex-rs/tui/src/bottom_pane) uses a single row, a
 * muted " · " separator, per-category colors and ellipsis truncation. The six
 * REQUIRED_ITEMS below mirror its default model+reasoning / cwd / thread name
 * / run-state / version information and are always rendered.
 *
 * Segment functions return plain text only; render.ts owns all ANSI styling.
 */

import { basename } from "node:path";
import type { StatuslineConfig } from "./config.ts";
import type { RenderState, RunState, StatusContext } from "./types.ts";

export type Accent = "model" | "path" | "branch" | "state" | "usage" | "metadata" | "thread";

export interface Item {
	id: string;
	accent: Accent;
	text: string;
}

export interface SegmentState {
	config: StatuslineConfig;
	context: StatusContext;
	run: RunState;
	branch: string | null;
	statuses: ReadonlyMap<string, string>;
	now: Date;
}

/** These six must always be present. */
export const REQUIRED_ITEMS = [
	"session",
	"cwd",
	"model",
	"reasoning",
	"state",
	"version",
] as const;

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
	const costTotal = typeof cost === "object" && cost !== null ? (cost as Record<string, unknown>).total : undefined;
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

/** Fallback when `/name` has not been used: a short session id. */
function shortSessionName(context: StatusContext): string {
	const explicit = context.sessionName?.trim();
	if (explicit) return explicit;
	return "untitled";
}

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function runStateText(state: SegmentState): string {
	if (state.run.waitingForUser) return "Waiting for input";
	if (state.run.idle) return "Ready";
	const frame = SPINNER[Math.floor(state.now.getTime() / 120) % SPINNER.length];
	return `${frame} Working`;
}

/** Build all items in display order. Required items never return undefined. */
export function buildItems(state: SegmentState): Item[] {
	const { context, config } = state;
	const items: Item[] = [
		{ id: "session", accent: "thread", text: shortSessionName(context) },
		{ id: "cwd", accent: "path", text: shortenPath(context.cwd) || basename(context.cwd) },
		{
			id: "model",
			accent: "model",
			text: context.model?.id ?? "no-model",
		},
		{
			id: "reasoning",
			accent: "model",
			text: context.thinkingLevel ? `reasoning:${context.thinkingLevel}` : "reasoning:off",
		},
		{ id: "state", accent: "state", text: runStateText(state) },
		{ id: "version", accent: "metadata", text: `pi v${context.piVersion}` },
	];

	if (!config.extras) return items;

	const push = (id: string, accent: Accent, text: string | undefined): void => {
		if (text) items.push({ id, accent, text });
	};

	if (state.branch) {
		push("git", "branch", `${config.nerd ? "\ue0a0 " : ""}${state.branch}`);
	}
	const usage = context.getContextUsage();
	if (usage?.percent !== null && usage?.percent !== undefined) {
		push("context", "usage", `context:${Math.round(usage.percent)}%`);
	}
	const { input, output, cost } = totals(state);
	if (input > 0 || output > 0) {
		push("tokens", "usage", `↑${formatCount(input)} ↓${formatCount(output)}`);
	}
	if (cost > 0) push("cost", "usage", `$${cost.toFixed(3)}`);
	push("clock", "metadata", state.now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
	return items;
}

/** Required items plus the ids of any optional extras that were rendered. */
export function assertRequired(items: Item[]): void {
	const present = new Set(items.map((item) => item.id));
	const missing = REQUIRED_ITEMS.filter((id) => !present.has(id));
	if (missing.length > 0) throw new Error(`pi-statusline: missing required items: ${missing.join(", ")}`);
}

export function stateFrom(render: RenderState, footerData: RenderState["footerData"]): SegmentState {
	return {
		config: render.config,
		context: render.context,
		run: render.run,
		branch: footerData.getGitBranch(),
		statuses: footerData.getExtensionStatuses(),
		now: new Date(),
	};
}
