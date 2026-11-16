/**
 * Footer rendering. Produces a Component that Pi installs via ctx.ui.setFooter().
 *
 * Rules followed (docs/tui.md):
 *  - every line is truncated to the given width
 *  - ANSI widths are measured with visibleWidth()
 *  - cached themed strings are thrown away in invalidate()
 *  - no ANSI-colored strings are stored as long-lived state
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { StatuslineConfig } from "./config.ts";
import { groupsFor, SEGMENTS, type SegmentState } from "./segments.ts";
import type { FooterComponent, RenderState, Theme, TUI } from "./types.ts";

function style(theme: Theme, text: string, color: "accent" | "dim" | "muted" | "success" | "warning"): string {
	return theme.fg(color, text);
}

function joined(parts: string[], separator: string): string {
	return parts.filter((part) => part.length > 0).join(separator);
}

export function createFooter(state: RenderState): FooterComponent {
	const { config, context, footerData, theme, tui } = state;
	const groups = groupsFor(config);
	const byId = new Map(SEGMENTS.map((segment) => [segment.id, segment]));

	let cached: { key: string; lines: string[] } | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;
	const unsubBranch = footerData.onBranchChange(() => tui.requestRender());

	const snapshot = (): SegmentState => ({
		config,
		context,
		branch: footerData.getGitBranch(),
		statuses: footerData.getExtensionStatuses(),
		now: new Date(),
		working: !context.isIdle(),
	});

	const build = (width: number): string[] => {
		const data = snapshot();
		const renderGroup = (ids: string[], color: "accent" | "muted" | "dim"): string => {
			const parts: string[] = [];
			for (const id of ids) {
				const text = byId.get(id)?.render(data);
				if (text) parts.push(style(theme, text, id === "git" ? color : "dim"));
			}
			return joined(parts, style(theme, config.separator, "dim"));
		};

		const left = config.left ? renderGroup(groups.left, "accent") : "";
		const right = config.right ? renderGroup(groups.right, "muted") : "";
		const lines: string[] = [];

		if (left || right) {
			const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
			lines.push(truncateToWidth(`${left}${" ".repeat(gap)}${right}`, width));
		} else {
			lines.push("");
		}

		if (config.statuses) {
			const statuses = [...data.statuses.values()].filter(Boolean);
			if (statuses.length > 0) {
				lines.push(truncateToWidth(style(theme, joined(statuses, "  "), "muted"), width));
			}
		}

		return lines;
	};

	if (config.refreshMs > 0) {
		timer = setInterval(() => tui.requestRender(), config.refreshMs);
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
