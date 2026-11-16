/**
 * pi-statusline — Codex-style footer for the Pi coding agent.
 *
 * Always shows: session name, project path, model, reasoning level, agent run
 * state, and Pi version. Optional extras: git branch, context, tokens, cost,
 * and other extensions' status texts. No clock is shown.
 *
 * Install:
 *   pi -e /home/chr/pi-statusline
 *   pi install git:github.com/Hara602/pi-statusline
 *
 * Commands:
 *   /statusline [status|on|off|toggle|reload|preset <minimal|compact|full>]
 */

import { VERSION, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { applyPreset, DEFAULT_CONFIG, isPreset, loadConfig, type StatuslineConfig } from "./config.ts";
import { createFooter } from "./render.ts";
import { deriveSessionTitle } from "./segments.ts";
import type { FooterComponent, RunState, StatusContext, TUI } from "./types.ts";

const NAME = "pi-statusline";

function toContext(ctx: ExtensionContext, name: string | undefined, title: string | undefined): StatusContext {
	return {
		cwd: ctx.cwd,
		mode: ctx.mode,
		model: ctx.model,
		thinkingLevel: ctx.thinkingLevel,
		sessionName: name,
		sessionTitle: title,
		sessionId: ctx.sessionManager.getSessionId(),
		piVersion: VERSION,
		getContextUsage: () => ctx.getContextUsage(),
		sessionManager: ctx.sessionManager,
	};
}

function describe(config: StatuslineConfig): string {
	return `${config.enabled ? "on" : "off"}, preset=${config.preset}, extras=${config.extras}, colors=${config.colors}, statuses=${config.statuses}`;
}

export default function (pi: ExtensionAPI) {
	let config: StatuslineConfig = { ...DEFAULT_CONFIG };
	let active = false;
	let footer: FooterComponent | undefined;
	let activeTui: TUI | undefined;

	const run: RunState = { idle: true, waitingForUser: false, promptDepth: 0, changedAt: Date.now() };
	let sessionName: string | undefined;
	let sessionTitle: string | undefined;
	let contextSnapshot: StatusContext | undefined;

	const refresh = (): void => {
		if (!activeTui) return;
		footer?.invalidate();
		activeTui.requestRender();
	};

	const install = (ctx: ExtensionContext): void => {
		if (ctx.mode !== "tui") return;
		contextSnapshot = toContext(ctx, sessionName, sessionTitle);
		ctx.ui.setFooter((tui, theme, footerData) => {
			footer = createFooter({
				config,
				context: contextSnapshot!,
				footerData,
				theme,
				tui,
				run,
			});
			activeTui = tui;
			return footer;
		});
		active = true;
	};

	const uninstall = (ctx: ExtensionContext): void => {
		ctx.ui.setFooter(undefined);
		footer = undefined;
		activeTui = undefined;
		active = false;
	};

	// --- required-field sources -------------------------------------------------

	pi.on("session_start", async (_event, ctx) => {
		config = await loadConfig(pi, ctx);
		sessionName = ctx.sessionManager.getSessionName();
		sessionTitle = deriveSessionTitle({
			config,
			context: toContext(ctx, sessionName, undefined),
			run,
			branch: null,
			statuses: new Map(),
			now: new Date(),
		});
		run.idle = ctx.isIdle();
		if (config.enabled) install(ctx);
		else uninstall(ctx);
	});

	pi.on("session_info_changed", async (event) => {
		sessionName = event.name;
		if (contextSnapshot) contextSnapshot.sessionName = sessionName;
		refresh();
	});

	// An unnamed session is labelled with its first user message, matching the
	// built-in session picker. Keep that label up to date as messages arrive.
	pi.on("message_start", async (event) => {
		const message = event.message as { role?: string; content?: unknown };
		if (message.role !== "user" || contextSnapshot?.sessionTitle) return;
		const text = typeof message.content === "string"
			? message.content
			: Array.isArray(message.content)
				? (message.content.find((part) => part && typeof part === "object" && (part as { type?: string }).type === "text") as { text?: unknown } | undefined)?.text
				: undefined;
		if (typeof text !== "string" || !text.trim()) return;
		sessionTitle = text.replace(/\s+/g, " ").trim();
		if (contextSnapshot) contextSnapshot.sessionTitle = sessionTitle;
		refresh();
	});

	pi.on("model_select", async (event, ctx) => {
		if (contextSnapshot) {
			contextSnapshot.model = ctx.model ?? event.model;
			contextSnapshot.thinkingLevel = ctx.thinkingLevel;
		}
		refresh();
	});

	pi.on("thinking_level_select", async (event) => {
		if (contextSnapshot) contextSnapshot.thinkingLevel = event.level;
		refresh();
	});

	// --- agent run state --------------------------------------------------------

	pi.on("agent_start", async () => {
		run.idle = false;
		run.changedAt = Date.now();
		refresh();
	});

	pi.on("agent_settled", async () => {
		run.idle = true;
		run.changedAt = Date.now();
		refresh();
	});

	pi.on("ui_prompt_start", async () => {
		run.promptDepth += 1;
		run.waitingForUser = true;
		refresh();
	});

	pi.on("ui_prompt_end", async () => {
		run.promptDepth = Math.max(0, run.promptDepth - 1);
		run.waitingForUser = run.promptDepth > 0;
		refresh();
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (active) uninstall(ctx);
	});

	// --- command ----------------------------------------------------------------

	pi.registerCommand("statusline", {
		description: "Codex-style statusline: status|on|off|toggle|reload|preset <minimal|compact|full>",
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
						ctx.ui.notify("Usage: /statusline preset <minimal|compact|full>", "warning");
						return;
					}
					applyPreset(config, value);
					if (active) install(ctx);
					ctx.ui.notify(`${NAME}: ${describe(config)}`, "info");
					return;
				}
				default:
					ctx.ui.notify("Usage: /statusline [status|on|off|toggle|reload|preset <name>]", "warning");
			}
		},
	});
}
