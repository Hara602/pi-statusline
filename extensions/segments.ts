/**
 * Codex-style status line items.
 *
 * Codex's statusline (codex-rs/tui/src/bottom_pane) uses a single row, a
 * muted " · " separator, per-category colors and ellipsis truncation. The six
 * REQUIRED_ITEMS below mirror its default model+reasoning / cwd / thread name
 * / run-state / version information and are always rendered.
 *
 * Segment functions return plain text only; render.ts owns all ANSI styling.
 * The estimated session cost is hidden unless `showCost` is enabled.
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

/** Extract a one-line label from a user message, like Pi's session picker does. */
function firstUserText(content: unknown): string | undefined {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return undefined;
	for (const part of content) {
		if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
			const text = (part as { text?: unknown }).text;
			if (typeof text === "string" && text.trim()) return text;
		}
	}
	return undefined;
}

/** Pi's session picker uses the first user message when /name was never used. */
export function deriveSessionTitle(state: SegmentState): string | undefined {
	for (const entry of state.context.sessionManager.getBranch()) {
		if (entry.type !== "message" || entry.message?.role !== "user") continue;
		const text = firstUserText(entry.message.content)?.replace(/\s+/g, " ").trim();
		if (text) return text;
	}
	return undefined;
}

/** Keep the session name short enough that it cannot crowd out the other fields. */
export const SESSION_LABEL_MAX = 15;

/** Ellipsize plain text by characters, counting the ellipsis in the budget. */
export function clipSessionLabel(text: string, max = SESSION_LABEL_MAX): string {
	if (max <= 0) return "";
	const chars = Array.from(text);
	if (chars.length <= max) return text;
	return `${chars.slice(0, max - 1).join("")}…`;
}

/** Explicit /name wins; otherwise first user message; finally a short session id. */
function sessionLabel(state: SegmentState): string {
	const explicit = state.context.sessionName?.trim();
	if (explicit) return clipSessionLabel(explicit);
	const derived = state.context.sessionTitle?.trim() || deriveSessionTitle(state);
	if (derived) return clipSessionLabel(derived);
	return clipSessionLabel(`session ${state.context.sessionId.slice(0, 8)}`);
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
		{ id: "session", accent: "thread", text: sessionLabel(state) },
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
	const { input, output } = totals(state);
	if (input > 0 || output > 0) {
		push("tokens", "usage", `↑${formatCount(input)} ↓${formatCount(output)}`);
	}
	return items;
}

/** Cost is opt-in: it is appended only when `showCost` is explicitly enabled. */
export function appendCost(items: Item[], state: SegmentState): void {
	if (!state.config.showCost) return;
	const { cost } = totals(state);
	if (cost > 0) items.push({ id: "cost", accent: "usage", text: `$${cost.toFixed(3)}` });
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
