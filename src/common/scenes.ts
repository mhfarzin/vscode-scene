/**
 * scenes.ts
 * ---------------------------------------------------------------------------
 * Shared scene constants & helpers used by BOTH the extension host
 * (`src/host/`) and the webview (`src/webview/`).
 *
 * This is the single source of truth for:
 *   - the list of available scene types (`SCENE_TYPES`)
 *   - the default scene (`DEFAULT_SCENE_TYPE`)
 *   - safe parsing/validation helpers (`isSceneType`, `parseSceneType`)
 *
 * This file must stay framework-agnostic: it must NOT import anything from
 * `vscode` or reference the DOM, so it can be bundled into both the Node
 * extension host and the browser-like webview sandbox.
 *
 * Adding a new scene requires:
 *   1. Adding a new value to the `ScreenType` enum below.
 *   2. Creating the screen class in `src/webview/screens/`.
 *   3. Registering it in `ScreenFactory.ts`.
 *   4. Adding it to the `vscode-scene.screen` enum in `package.json`.
 *      (`package.json` cannot import TypeScript — keep it manually in sync.)
 * ---------------------------------------------------------------------------
 */

/** Every scene screen available in the extension. */
export enum ScreenType {
    /** Twinkling stars drifting upward (Canvas2D). */
    Stars = 'stars',

    /** Sky scene: light-blue sky, drifting clouds, flying airplanes (Pixi.js). */
    SkyPilot = 'sky-pilot',

    /** Fish tank: cute cartoon fish swimming in a bubbling aquarium (Canvas2D). */
    Aquarium = 'aquarium',
}

/** All scene types, in the order shown in the QuickPick picker. */
export const SCENE_TYPES: readonly ScreenType[] = [
    ScreenType.SkyPilot,
    ScreenType.Aquarium,
    ScreenType.Stars,
];

/** Default scene used when the setting is missing or invalid. */
export const DEFAULT_SCENE_TYPE = ScreenType.SkyPilot;

/** Key of the `vscode-scene.screen` configuration setting. */
export const SCREEN_SETTING = 'screen';

/**
 * Checks whether an arbitrary string names a known scene.
 *
 * @param value - any string (e.g. from settings or injected globals)
 * @returns true when the value is one of the known `ScreenType` values
 */
export function isSceneType(value: string): value is ScreenType {
    return (SCENE_TYPES as readonly string[]).includes(value);
}

/**
 * Safely converts an arbitrary string into a valid `ScreenType`,
 * falling back to the default scene for unknown/empty values.
 *
 * This is the single parsing entry point for both the host
 * (setting validation) and the webview (screen switching).
 *
 * @param value - the raw scene-type string (may be undefined/null)
 * @returns a valid `ScreenType`
 */
export function parseSceneType(value: string | undefined | null): ScreenType {
    if (value !== undefined && value !== null && isSceneType(value)) {
        return value;
    }
    return DEFAULT_SCENE_TYPE;
}
