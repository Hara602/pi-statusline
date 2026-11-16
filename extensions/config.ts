/**
 * Pi statusline configuration, Codex-style.
 *
 * Six fields are always shown and cannot be disabled:
 *   session name · project path · model · reasoning · run state · pi version
 *
 * Optional extras (git branch, context, tokens) can be layered on. Cost is
 * hidden by default and can be re-enabled with `showCost: true`.
 * There is deliberately no clock: the status line shows durable session state.
 * Configuration is read at startup and on `/statusline reload`.
 *
 * Environment overrides:
 *   PI_STATUSLINE_CONFIG=/abs/path/to/config.json
 *   PI_STATUSLINE_ENABLED=0|1
 *   PI_STATUSLINE_PRESET=minimal|compact|full
 *   PI_STATUSLINE_COLORS=0|1
 *   PI_STATUSLINE_COST=0|1
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isAbsolute, join } from "node:path";
import type { SettingsLike } from "./types.ts";

export type Preset = "minimal" | "compact" | "full";

export interface StatuslineConfig {
	/** Whether the custom footer is installed on session start. */
	enabled: boolean;
	/** Which optional extras to show. The six required fields are always present. */
	preset: Preset;
	/** Separator between items (Codex uses " · "). */
	separator: string;
	/** Show optional extras: git branch, context, tokens. */
	extras: boolean;
	/** Show the estimated session cost. Off by default; independent of `extras`/preset. */
	showCost: boolean;
	/** Show a second line with other extensions' ctx.ui.setStatus() values. */
	statuses: boolean;
	/** Use Nerd Font glyphs where available. */
	nerd: boolean;
	/** Use Codex-like per-category colors instead of one dim color. */
	colors: boolean;
	/** Spinner animation refresh interval in ms; 0 disables the interval. */
	refreshMs: number;
}

export const DEFAULT_CONFIG: StatuslineConfig = {
	enabled: true,
	preset: "compact",
	separator: " · ",
	extras: true,
	showCost: false,
	statuses: false,
	nerd: false,
	colors: true,
	refreshMs: 250,
};

const PRESETS: Record<Preset, Partial<StatuslineConfig>> = {
	minimal: { extras: false, statuses: false },
	compact: { extras: true, statuses: false },
	full: { extras: true, statuses: true },
};

export const PRESET_NAMES = Object.keys(PRESETS) as Preset[];

export function isPreset(value: string): value is Preset {
	return PRESET_NAMES.includes(value as Preset);
}

export function applyPreset(config: StatuslineConfig, preset: Preset): void {
	Object.assign(config, PRESETS[preset]);
	config.preset = preset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configPaths(ctx: ExtensionContext): string[] {
	const override = process.env.PI_STATUSLINE_CONFIG?.trim();
	if (override) {
		return [isAbsolute(override) ? override : join(process.cwd(), override)];
	}

	const home = process.env.HOME;
	const agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || (home ? join(home, ".pi", "agent") : undefined);
	if (!agentDir) return [];
	return [
		join(agentDir, "extensions", "pi-statusline.json"),
		join(agentDir, "pi-statusline.json"),
	];
}

function merge(config: StatuslineConfig, raw: unknown): void {
	if (!isRecord(raw)) return;
	if (typeof raw.enabled === "boolean") config.enabled = raw.enabled;
	if (typeof raw.separator === "string") config.separator = raw.separator.slice(0, 12);
	if (typeof raw.extras === "boolean") config.extras = raw.extras;
	if (typeof raw.showCost === "boolean") config.showCost = raw.showCost;
	if (typeof raw.statuses === "boolean") config.statuses = raw.statuses;
	if (typeof raw.nerd === "boolean") config.nerd = raw.nerd;
	if (typeof raw.colors === "boolean") config.colors = raw.colors;
	if (typeof raw.refreshMs === "number" && Number.isFinite(raw.refreshMs) && raw.refreshMs >= 0) {
		config.refreshMs = Math.min(60_000, Math.floor(raw.refreshMs));
	}
	if (typeof raw.preset === "string" && isPreset(raw.preset)) applyPreset(config, raw.preset);
	// Explicit keys override the preset's defaults.
	if (typeof raw.extras === "boolean") config.extras = raw.extras;
	if (typeof raw.statuses === "boolean") config.statuses = raw.statuses;
}

/** Load and validate config. Never throws: a bad file falls back to defaults. */
export async function loadConfig(pi: ExtensionAPI, ctx: ExtensionContext): Promise<StatuslineConfig> {
	const config: StatuslineConfig = { ...DEFAULT_CONFIG };

	for (const path of configPaths(ctx)) {
		try {
			const { readFile } = await import("node:fs/promises");
			const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
			merge(config, parsed);
			break;
		} catch {
			// Missing or malformed file: try the next path, then use defaults.
		}
	}

	// settings.json is checked too; a dedicated config file takes precedence.
	if (!process.env.PI_STATUSLINE_CONFIG?.trim()) {
		try {
			const settings = pi.getSettings() as SettingsLike | undefined;
			merge(config, settings?.statusline);
		} catch {
			// getSettings() is best-effort.
		}
	}

	if (process.env.PI_STATUSLINE_ENABLED === "0") config.enabled = false;
	if (process.env.PI_STATUSLINE_ENABLED === "1") config.enabled = true;
	if (process.env.PI_STATUSLINE_COLORS === "0") config.colors = false;
	if (process.env.PI_STATUSLINE_COLORS === "1") config.colors = true;
	if (process.env.PI_STATUSLINE_COST === "0") config.showCost = false;
	if (process.env.PI_STATUSLINE_COST === "1") config.showCost = true;
	const envPreset = process.env.PI_STATUSLINE_PRESET?.trim();
	if (envPreset && isPreset(envPreset)) applyPreset(config, envPreset);

	return config;
}
