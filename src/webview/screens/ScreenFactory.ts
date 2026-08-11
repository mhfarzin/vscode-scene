/**
 * ScreenFactory.ts
 * ---------------------------------------------------------------------------
 * Simple factory that instantiates the correct screen class based on
 * the `ScreenConfig.type` enum value.
 *
 * Centralizes screen creation so callers just pass a config and never
 * need to import individual screen classes.
 * ---------------------------------------------------------------------------
 */

import { ScreenType } from '../../common/scenes';
import { ScreenConfig, BaseScreen } from './BaseScreen';
import { StarsScreen } from './StarsScreen';
import { SkyPilotScreen } from './SkyPilotScreen';
import { AquariumScreen } from './AquariumScreen';

/**
 * Creates a screen instance for the given configuration.
 *
 * @param canvas - the <canvas> element the screen will render on
 * @param config - configuration (mainly the screen `type`)
 * @returns an instantiated BaseScreen subclass
 */
export function createScreen(
    canvas: HTMLCanvasElement,
    config: ScreenConfig
): BaseScreen {
    switch (config.type) {
        case ScreenType.Stars:
            return new StarsScreen(canvas, config);

        case ScreenType.SkyPilot:
            return new SkyPilotScreen(canvas, config);

        case ScreenType.Aquarium:
            return new AquariumScreen(canvas, config);

        // Unknown type → fall back to the default Stars screen.
        default:
            return new StarsScreen(canvas, { type: ScreenType.Stars });
    }
}
