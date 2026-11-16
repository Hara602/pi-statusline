/**
 * Shared types. Kept loose on purpose so the extension works across Pi
 * point releases whose exported type surface may differ slightly.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import type { ReadonlyFooterDataProvider, Theme } from "@earendil-works/pi-coding-agent";

export type { Component, Theme, TUI, ReadonlyFooterDataProvider };

export interface SettingsLike {
	statusline?: Record<string, unknown> | undefined;
}

/** Context fields the renderer needs, plus the dynamic values we track ourselves. */
export interface StatusContext {
	cwd: string;
	mode: string;
	model: { id?: string; provider?: string; contextWindow?: number } | undefined;
	thinkingLevel: string | undefined;
	/** Explicit name from /name, if set. */
	sessionName: string | undefined;
	/** Fallback title derived from the first user message, like Pi's session picker. */
	sessionTitle: string | undefined;
	/** Short session id, used when neither a name nor a first message exists. */
	sessionId: string;
	piVersion: string;
	getContextUsage: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
	sessionManager: {
		getSessionId: () => string;
		getBranch: (fromId?: string) => ReadonlyArray<{
			type: string;
			message?: { role: string; content?: unknown; usage?: unknown };
		}>;
	};
}

/** Everything that can change between two renders. */
export interface RenderState {
	config: import("./config.ts").StatuslineConfig;
	context: StatusContext;
	footerData: ReadonlyFooterDataProvider;
	theme: Theme;
	tui: TUI;
	/** Mutable run-state shared with the extension's event handlers. */
	run: RunState;
}

export interface RunState {
	/** False while an agent run / retry / compaction / queued continuation is active. */
	idle: boolean;
	/** Pi is waiting for a blocking extension UI prompt. */
	waitingForUser: boolean;
	/** Number of currently open blocking prompts (they can nest). */
	promptDepth: number;
	/** Wall-clock time of the latest activity transition. */
	changedAt: number;
}

export type FooterComponent = Component & { dispose?(): void };
