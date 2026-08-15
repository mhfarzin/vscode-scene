import * as assert from 'assert';

// Shared, framework-agnostic helpers — no `vscode` import needed, so they
// can be tested directly inside the vscode-test harness.
import {
    ScreenType,
    SCENE_TYPES,
    DEFAULT_SCENE_TYPE,
    SCREEN_SETTING,
    isSceneType,
    parseSceneType,
} from '../common/scenes';
import { getNonce } from '../common/nonce';
import { BalancedDeck } from '../webview/utils/random';

// ---------------------------------------------------------------------------
// scenes.ts
// ---------------------------------------------------------------------------
suite('scenes', () => {
    test('ScreenType enum values match the settings in package.json', () => {
        assert.strictEqual(ScreenType.Stars, 'stars');
        assert.strictEqual(ScreenType.SkyPilot, 'sky-pilot');
        assert.strictEqual(ScreenType.Aquarium, 'aquarium');
    });

    test('SCENE_TYPES lists every screen, in picker order', () => {
        assert.deepStrictEqual([...SCENE_TYPES], [
            ScreenType.SkyPilot,
            ScreenType.Aquarium,
            ScreenType.Stars,
        ]);
    });

    test('DEFAULT_SCENE_TYPE is a known scene', () => {
        assert.ok(isSceneType(DEFAULT_SCENE_TYPE));
        assert.strictEqual(DEFAULT_SCENE_TYPE, ScreenType.SkyPilot);
    });

    test('SCREEN_SETTING points at the "screen" configuration key', () => {
        assert.strictEqual(SCREEN_SETTING, 'screen');
    });

    test('isSceneType returns true for every known scene', () => {
        for (const type of SCENE_TYPES) {
            assert.ok(isSceneType(type), `expected "${type}" to be a scene`);
        }
    });

    test('isSceneType returns false for unknown values', () => {
        assert.strictEqual(isSceneType(''), false);
        assert.strictEqual(isSceneType('galaxy'), false);
        assert.strictEqual(isSceneType('STARS'), false);
        assert.strictEqual(isSceneType('sky_pilot'), false);
        assert.strictEqual(isSceneType('stars '), false);
    });

    test('parseSceneType returns the value unchanged for known scenes', () => {
        for (const type of SCENE_TYPES) {
            assert.strictEqual(parseSceneType(type), type);
        }
    });

    test('parseSceneType falls back for undefined / null / invalid input', () => {
        assert.strictEqual(parseSceneType(undefined), DEFAULT_SCENE_TYPE);
        assert.strictEqual(parseSceneType(null), DEFAULT_SCENE_TYPE);
        assert.strictEqual(parseSceneType(''), DEFAULT_SCENE_TYPE);
        assert.strictEqual(parseSceneType('  '), DEFAULT_SCENE_TYPE);
        assert.strictEqual(parseSceneType('galaxy'), DEFAULT_SCENE_TYPE);
        assert.strictEqual(parseSceneType('SkyPilot'), DEFAULT_SCENE_TYPE);
    });
});

// ---------------------------------------------------------------------------
// nonce.ts
// ---------------------------------------------------------------------------
suite('nonce', () => {
    test('getNonce returns a 32-character value', () => {
        assert.strictEqual(getNonce().length, 32);
    });

    test('getNonce only uses alphanumeric characters', () => {
        assert.match(getNonce(), /^[A-Za-z0-9]{32}$/);
    });

    test('getNonce produces distinct values', () => {
        const a = getNonce();
        const b = getNonce();
        assert.notStrictEqual(a, b);
    });
});

// ---------------------------------------------------------------------------
// random.ts — BalancedDeck
// ---------------------------------------------------------------------------
suite('BalancedDeck', () => {
    test('constructor clamps numBands to at least 1', () => {
        const deck = new BalancedDeck(0);
        assert.strictEqual(deck.next(), 0);
    });

    test('next() returns band indices within [0, numBands)', () => {
        const deck = new BalancedDeck(4);
        for (let i = 0; i < 50; i++) {
            const band = deck.next();
            assert.ok(band >= 0 && band < 4, `band ${band} out of range`);
        }
    });

    test('each cycle of numBands draws visits every band exactly once', () => {
        const numBands = 5;
        const deck = new BalancedDeck(numBands);
        const seen = new Set<number>();

        for (let i = 0; i < numBands; i++) {
            seen.add(deck.next());
        }
        assert.strictEqual(seen.size, numBands);
        assert.deepStrictEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
    });

    test('no band repeats before a full cycle completes', () => {
        const numBands = 3;
        const deck = new BalancedDeck(numBands);
        const seen = new Set<number>();

        for (let i = 0; i < numBands; i++) {
            const band = deck.next();
            assert.ok(!seen.has(band), `band ${band} repeated too early`);
            seen.add(band);
        }
    });

    test('nextValue returns values within [min, max)', () => {
        const deck = new BalancedDeck(4);
        for (let i = 0; i < 100; i++) {
            const v = deck.nextValue(10, 50);
            assert.ok(v >= 10 && v < 50, `value ${v} out of range`);
        }
    });

    test('nextValue covers the full range over repeated cycles', () => {
        const deck = new BalancedDeck(4);
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < 4; i++) {
            const v = deck.nextValue(0, 100);
            min = Math.min(min, v);
            max = Math.max(max, v);
        }
        assert.strictEqual(max - min > 50, true, 'expected spread across bands');
    });

    test('deck reshuffles automatically after exhaustion', () => {
        const numBands = 2;
        const deck = new BalancedDeck(numBands);
        const firstCycle: number[] = [];
        for (let i = 0; i < numBands; i++) {
            firstCycle.push(deck.next());
        }
        // Second full cycle must also contain every band exactly once.
        const secondCycle = new Set<number>();
        for (let i = 0; i < numBands; i++) {
            secondCycle.add(deck.next());
        }
        assert.strictEqual(secondCycle.size, numBands);
        assert.deepStrictEqual(
            [...secondCycle].sort((a, b) => a - b),
            [...firstCycle].sort((a, b) => a - b)
        );
    });
});
