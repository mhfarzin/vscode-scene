/**
 * ScreenType.ts
 * ---------------------------------------------------------------------------
 * Enumeration of every screensaver screen available in the extension.
 *
 * Adding a new screen type requires:
 *   1. Adding a new enum value here.
 *   2. Creating the screen class in `src/panel/screens/`.
 *   3. Registering it in `ScreenFactory.ts`.
 *   4. Selecting it in `src/panel/panel.ts` (for testing).
 * ---------------------------------------------------------------------------
 */

export enum ScreenType {
    /** Twinkling stars drifting upward (Canvas2D). */
    Stars = 'stars',

    /** Sky scene: light-blue sky, drifting clouds, flying airplanes (Pixi.js). */
    SkyPilot = 'sky-pilot',
}
