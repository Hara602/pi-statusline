/**
 * Footer component, styled after Codex CLI's bottom status line.
 *
 * - single row, " · " separator, per-category soft colors
 * - required items are never dropped, even on a narrow terminal: optional
 *   extras are removed first, then required values are ellipsized one at a time
 * - all width math uses visibleWidth()/truncateToWidth() from pi-tui
 * - invalidate() clears cached themed lines, dispose() stops the timer and
 *   unsubscribes from git-branch changes
 */

import { stripTerminalSequences, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Accent, Item } from "./segments.ts";
import { assertRequired, buildItems, REQUIRED_ITEMS, stateFrom } from "./segments.ts";
import type { FooterComponent, RenderState, Theme } from "./types.ts";

/** Codex's StatusLineAccent fallbacks: cyan / green / magenta. */
const FALLBACK: Record<Accent, "accent" | "dim" | "success" | "error" | "warning" | "muted"> = {
	model: "accent",
	state: "accent",
	metadata: "accent",
	path: "success",
	usage: "success",
	branch: "warning",
	thread: "warning",
};

/** Display order for the six mandatory items. */
const ORDER = REQUIRED_ITEMS;
const REQUIRED_SET = new Set<string>(REQUIRED_ITEMS);

/** Truncate plain text without leaving ANSI escape codes inside the value. */
function clip(text: string, maxWidth: number | undefined): string {
	if (maxWidth === undefined || visibleWidth(text) <= maxWidth) return text;
	return stripTerminalSequences(truncateToWidth(text, maxWidth, "…"));
}

function styledItem(theme: Theme, item: Item, colorsEnabled: boolean, maxWidth?: number): string {
	const raw = clip(item.text, maxWidth);
	if (!colorsEnabled) return theme.fg("dim", raw);
	// Use semantic theme tokens rather than hard-coded RGB so the line adapts to
	// the user's light/dark theme, as Codex's softened status colors do.
	return theme.fg(FALLBACK[item.accent], raw);
}

function makeLine(
	theme: Theme,
	items: Item[],
	config: RenderState["config"],
	limits: Map<string, number>,
	separatorText: string,
): string {
	const separator = theme.fg("dim", separatorText);
	return items
		.map((item) => styledItem(theme, item, config.colors, limits.get(item.id)))
		.join(separator);
}

/**
 * Fit items into width. Optional extras are dropped first. Then the longest
 * required value is ellipsized one cell at a time (Codex uses the same
 * priority-based shrinking idea). Every required item keeps at least 1 column.
 */
export function fitItems(theme: Theme, items: Item[], config: RenderState["config"], width: number): string {
	assertRequired(items);
	// Codex keeps its " · " separator, but on very narrow terminals we tighten
	// it before sacrificing any of the six required values.
	const separator = visibleWidth(config.separator) * 5 + 6 <= width ? config.separator : "·";
	let chosen = [...items];
	let line = makeLine(theme, chosen, config, new Map(), separator);
	if (visibleWidth(line) <= width) return line;

	// 1. Remove optional extras, from right to left.
	while (visibleWidth(line) > width) {
		const optional = chosen.map((item, index) => ({ item, index })).filter(({ item }) => !REQUIRED_SET.has(item.id)).pop();
		if (!optional) break;
		chosen = chosen.filter((_, index) => index !== optional.index);
		line = makeLine(theme, chosen, config, new Map(), separator);
	}
	if (visibleWidth(line) <= width) return line;

	// 2. Shrink the longest required value one column at a time.
	const limits = new Map<string, number>();
	for (const item of chosen) {
		if (REQUIRED_SET.has(item.id)) limits.set(item.id, visibleWidth(item.text));
	}
	let guard = width * ORDER.length + 128;
	while (visibleWidth(line) > width && guard-- > 0) {
		const shrinkable = [...limits.entries()]
			.filter(([, limit]) => limit > 1)
			.sort((a, b) => b[1] - a[1])[0];
		if (!shrinkable) break;
		limits.set(shrinkable[0], shrinkable[1] - 1);
		line = makeLine(theme, chosen, config, limits, separator);
	}
	return visibleWidth(line) > width ? truncateToWidth(line, width, "…") : line;
}

export function createFooter(render: RenderState): FooterComponent {
	const { config, footerData, theme, tui } = render;
	let cached: { key: string; lines: string[] } | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

	const build = (width: number): string[] => {
		const state = stateFrom(render, footerData);
		const items = buildItems(state);
		const lines: string[] = [fitItems(theme, items, config, width)];

		if (config.statuses) {
			const texts = [...state.statuses.values()].filter(Boolean);
			if (texts.length > 0) {
				lines.push(truncateToWidth(theme.fg("muted", texts.join("  ")), width, "…"));
			}
		}
		return lines;
	};

	const refresh = (): void => {
		cached = undefined;
		tui.requestRender();
	};

	if (config.refreshMs > 0) {
		timer = setInterval(refresh, config.refreshMs);
		timer.unref?.();
	}

	return {
		render(width: number): string[] {
			const key = String(width);
			if (cached?.key === key) return cached.lines;
			const lines = build(width);
			cached = { key, lines };
			return lines;
		},
		invalidate(): void {
			cached = undefined;
		},
		dispose(): void {
			if (timer) clearInterval(timer);
			unsubBranch();
			cached = undefined;
		},
	};
}

/** Notify the footer when an event changes run state. */
export function invalidateFooter(footer: FooterComponent | undefined, tui: RenderState["tui"]): void {
	footer?.invalidate();
	tui.requestRender();
}
