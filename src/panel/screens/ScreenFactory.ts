import { ScreenType } from './ScreenType';
import { ScreenConfig, BaseScreen } from './BaseScreen';
import { StarsScreen } from './StarsScreen';
import { SkyPilotScreen } from './SkyPilotScreen';

export function createScreen(
    canvas: HTMLCanvasElement,
    config: ScreenConfig
): BaseScreen {
    switch (config.type) {
        case ScreenType.Stars:
            return new StarsScreen(canvas, config);
        case ScreenType.SkyPilot:
            return new SkyPilotScreen(canvas, config);
        default:
            return new StarsScreen(canvas, { type: ScreenType.Stars });
    }
}
