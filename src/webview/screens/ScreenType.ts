/**
 * ScreenType.ts
 * ---------------------------------------------------------------------------
 * Enumeration of every scene screen available in the extension.
 *
 * Adding a new screen type requires:
 *   1. Adding a new enum value here.
 *   2. Creating the screen class in `src/webview/screens/`.
 *   3. Registering it in `ScreenFactory.ts`.
 *   4. Adding it to the `vscode-scene.screen` enum in `package.json`.
 *   5. Adding it to `VALID_SCENE_TYPES` in `src/host/ScenePanel.ts`.
 * ---------------------------------------------------------------------------
 */

export enum ScreenType {
    /** Twinkling stars drifting upward (Canvas2D). */
    Stars = 'stars',

    /** Sky scene: light-blue sky, drifting clouds, flying airplanes (Pixi.js). */
    SkyPilot = 'sky-pilot',

    /** Fish tank: cute cartoon fish swimming in a bubbling aquarium (Canvas2D). */
    Aquarium = 'aquarium',
}
