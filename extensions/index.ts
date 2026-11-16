/**
 * pi-statusline — a self-written, configurable Pi status line (footer).
 *
 * Load it as a local package:
 *   pi -e /home/chr/pi-statusline
 *   pi install ./pi-statusline
 *
 * Commands:
 *   /statusline [on|off|toggle|reload]   control the custom footer
 *   /statusline preset <name>            minimal | compact | full
 *
 * See README.md for configuration. TUI-only: setFooter() is a component
 * factory, so it does nothing outside interactive mode (docs/extensions.md).
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, loadConfig, type Preset, type StatuslineConfig } from "./config.ts";
import { createFooter } from "./render.ts";
import type { StatusContext } from "./types.ts";

const NAME = "pi-statusline";

function toContext(ctx: ExtensionContext): StatusContext {
	return {
		cwd: ctx.cwd,
		mode: ctx.mode,
		hasUI: ctx.hasUI,
		model: ctx.model,
		thinkingLevel: ctx.thinkingLevel,
		getContextUsage: () => ctx.getContextUsage(),
		isIdle: () => ctx.isIdle(),
		sessionManager: ctx.sessionManager,
	};
}

function presetNames(): string[] {
	return ["minimal", "compact", "full"];
}

function isPreset(value: string): value is Preset {
	return presetNames().includes(value);
}

function describe(config: StatuslineConfig): string {
	return `${config.enabled ? "on" : "off"}, preset=${config.preset}, left=${config.left}, right=${config.right}, statuses=${config.statuses}`;
}

export default function (pi: ExtensionAPI) {
	let config: StatuslineConfig = { ...DEFAULT_CONFIG };
	let active = false;

	const install = (ctx: ExtensionContext): void => {
		if (ctx.mode !== "tui") return;
		ctx.ui.setFooter((tui, theme, footerData) =>
			createFooter({ config, context: toContext(ctx), footerData, theme, tui }),
		);
		active = true;
	};

	const uninstall = (ctx: ExtensionContext): void => {
		ctx.ui.setFooter(undefined);
		active = false;
	};

	pi.on("session_start", async (_event, ctx) => {
		config = await loadConfig(pi, ctx);
		if (config.enabled) install(ctx);
		else uninstall(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (active) uninstall(ctx);
	});

	pi.registerCommand("statusline", {
		description: "Configure pi-statusline: on|off|toggle|reload|preset <minimal|compact|full>",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/statusline needs interactive TUI mode", "warning");
				return;
			}

			const [command, value] = args.trim().split(/\s+/, 2);

			switch (command) {
				case "":
				case undefined:
				case "status":
					ctx.ui.notify(`${NAME}: ${describe(config)}`, "info");
					return;
				case "off":
					config.enabled = false;
					uninstall(ctx);
					ctx.ui.notify(`${NAME}: off (built-in footer restored)`, "info");
					return;
				case "on":
					config.enabled = true;
					install(ctx);
					ctx.ui.notify(`${NAME}: ${describe(config)}`, "info");
					return;
				case "toggle":
					config.enabled = !config.enabled;
					if (config.enabled) install(ctx);
					else uninstall(ctx);
					ctx.ui.notify(`${NAME}: ${describe(config)}`, "info");
					return;
				case "reload":
					config = await loadConfig(pi, ctx);
					if (config.enabled) install(ctx);
					else uninstall(ctx);
					ctx.ui.notify(`${NAME}: reloaded (${describe(config)})`, "info");
					return;
				case "preset": {
					if (!value || !isPreset(value)) {
						ctx.ui.notify(`Usage: /statusline preset <${presetNames().join("|")}>`, "warning");
						return;
					}
					config.preset = value;
					const groups: Record<Preset, [boolean, boolean, boolean]> = {
						minimal: [true, false, false],
						compact: [true, true, false],
						full: [true, true, true],
					};
					[config.left, config.right, config.statuses] = groups[value];
					if (active) install(ctx);
					ctx.ui.notify(`${NAME}: ${describe(config)}`, "info");
					return;
				}
				default:
					ctx.ui.notify("Usage: /statusline [on|off|toggle|reload|preset <name>]", "warning");
			}
		},
	});
}
