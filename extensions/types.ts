/**
 * Shared types that do not need a Pi runtime import.
 * Keeping these loose makes the project usable on Pi versions whose exported
 * type surface differs slightly.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import type { ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";

export type { Component, Theme, TUI, ReadonlyFooterDataProvider };

/** The subset of settings.json this extension cares about. */
export interface SettingsLike {
	statusline?: Record<string, unknown> | undefined;
}

/** Context fields used by the footer builder. */
export interface StatusContext {
	cwd: string;
	mode: string;
	hasUI: boolean;
	model: { id?: string; provider?: string; contextWindow?: number } | undefined;
	thinkingLevel?: string;
	getContextUsage: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
	isIdle: () => boolean;
	sessionManager: {
		getBranch: (fromId?: string) => ReadonlyArray<{ type: string; message?: { role: string; usage?: unknown } }>;
	};
}

/** Data needed to build one status line. */
export interface RenderState {
	config: import("./config.ts").StatuslineConfig;
	context: StatusContext;
	footerData: ReadonlyFooterDataProvider;
	theme: Theme;
	tui: TUI;
}

/** A footer component with the extra lifecycle hooks Pi expects. */
export type FooterComponent = Component & { dispose?(): void };
