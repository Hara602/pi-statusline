/**
 * Pi statusline configuration.
 *
 * The extension reads this JSON at startup and whenever `/statusline reload` runs.
 * Every field is optional; unknown fields are ignored. Configuration is merged
 * over DEFAULT_CONFIG below.
 *
 * Environment overrides:
 *   PI_STATUSLINE_CONFIG=/abs/path/to/config.json
 *   PI_STATUSLINE_ENABLED=0|1
 *   PI_STATUSLINE_PRESET=minimal|compact|full
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SettingsLike } from "./types.ts";
import { isAbsolute, join } from "node:path";

export type Preset = "minimal" | "compact" | "full";

export interface StatuslineConfig {
	/** Whether the custom footer is installed on session start. */
	enabled: boolean;
	/** Which segments to show. */
	preset: Preset;
	/** Separator between segments on the same side. */
	separator: string;
	/** Show the left-hand group. */
	left: boolean;
	/** Show the right-hand group. */
	right: boolean;
	/** Show a second line with the active extension statuses (ctx.ui.setStatus()). */
	statuses: boolean;
	/** Use Nerd Font glyphs where available. Set false for plain ASCII. */
	nerd: boolean;
	/** Refresh the clock / working indicator at this interval, in ms. 0 disables the timer. */
	refreshMs: number;
}

export const DEFAULT_CONFIG: StatuslineConfig = {
	enabled: true,
	preset: "compact",
	separator: " │ ",
	left: true,
	right: true,
	statuses: false,
	nerd: false,
	refreshMs: 1000,
};

const PRESETS: Record<Preset, Partial<StatuslineConfig>> = {
	minimal: { left: true, right: false, statuses: false },
	compact: { left: true, right: true, statuses: false },
	full: { left: true, right: true, statuses: true },
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configPaths(ctx: ExtensionContext): string[] {
	const override = process.env.PI_STATUSLINE_CONFIG?.trim();
	if (override) {
		// Relative paths are resolved from cwd by node:fs, not from the extension.
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

function applyPreset(config: StatuslineConfig, preset: Preset): void {
	Object.assign(config, PRESETS[preset]);
	config.preset = preset;
}

/** Load and validate config. Never throws: a bad file falls back to defaults. */
export async function loadConfig(pi: ExtensionAPI, ctx: ExtensionContext): Promise<StatuslineConfig> {
	const config: StatuslineConfig = { ...DEFAULT_CONFIG };

	for (const path of configPaths(ctx)) {
		try {
			const text = await readTextFile(path);
			const parsed: unknown = JSON.parse(text);
			if (!isRecord(parsed)) continue;

			if (typeof parsed.enabled === "boolean") config.enabled = parsed.enabled;
			if (typeof parsed.separator === "string") config.separator = parsed.separator.slice(0, 12);
			if (typeof parsed.left === "boolean") config.left = parsed.left;
			if (typeof parsed.right === "boolean") config.right = parsed.right;
			if (typeof parsed.statuses === "boolean") config.statuses = parsed.statuses;
			if (typeof parsed.nerd === "boolean") config.nerd = parsed.nerd;
			if (
				typeof parsed.refreshMs === "number" &&
				Number.isFinite(parsed.refreshMs) &&
				parsed.refreshMs >= 0
			) {
				config.refreshMs = Math.min(60_000, Math.floor(parsed.refreshMs));
			}
			if (
				typeof parsed.preset === "string" &&
				Object.hasOwn(PRESETS, parsed.preset)
			) {
				applyPreset(config, parsed.preset as Preset);
			}
			// Individual left/right/statuses keys win over the preset.
			if (typeof parsed.left === "boolean") config.left = parsed.left;
			if (typeof parsed.right === "boolean") config.right = parsed.right;
			if (typeof parsed.statuses === "boolean") config.statuses = parsed.statuses;
			break;
		} catch {
			// Missing or malformed file: try the next path, then use defaults.
		}
	}

	// settings.json is checked too, but a dedicated config file takes precedence.
	// Ignore it when a custom PI_STATUSLINE_CONFIG path was supplied.
	if (!process.env.PI_STATUSLINE_CONFIG?.trim()) {
		try {
			const settings = pi.getSettings() as SettingsLike | undefined;
			const fromSettings = settings?.statusline;
			if (isRecord(fromSettings)) {
				if (typeof fromSettings.enabled === "boolean") config.enabled = fromSettings.enabled;
				if (
					typeof fromSettings.preset === "string" &&
					Object.hasOwn(PRESETS, fromSettings.preset)
				) {
					applyPreset(config, fromSettings.preset as Preset);
				}
				if (typeof fromSettings.separator === "string") {
					config.separator = fromSettings.separator.slice(0, 12);
				}
				if (typeof fromSettings.nerd === "boolean") config.nerd = fromSettings.nerd;
			}
		} catch {
			// getSettings() is best-effort; defaults remain.
		}
	}

	if (process.env.PI_STATUSLINE_ENABLED === "0") config.enabled = false;
	if (process.env.PI_STATUSLINE_ENABLED === "1") config.enabled = true;
	const envPreset = process.env.PI_STATUSLINE_PRESET?.trim();
	if (envPreset && Object.hasOwn(PRESETS, envPreset)) applyPreset(config, envPreset as Preset);

	return config;
}

async function readTextFile(path: string): Promise<string> {
	// Keep node:fs out of the module graph at load time for RPC/print-mode hosts.
	const { readFile } = await import("node:fs/promises");
	return readFile(path, "utf8");
}
