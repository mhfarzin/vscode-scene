/**
 * random.ts
 * ---------------------------------------------------------------------------
 * Balanced random helpers — shared across all screens.
 *
 * Plain `Math.random()` is uniform but can CLUSTER: 5 clouds at mid-height,
 * then 5 at the top. `BalancedDeck` fixes this by splitting a range into
 * equal "bands" and drawing from a shuffled deck, so each band is visited
 * exactly once per cycle before reshuffling. Results still look random,
 * but are spread evenly with no clumping.
 *
 * Available screens can use it for any random attribute:
 * positions (y), speeds, sizes, delays, etc.
 * ---------------------------------------------------------------------------
 */

/**
 * A shuffled-deck "balanced random" generator.
 *
 * Example usage:
 * ```ts
 * const deck = new BalancedDeck(4);        // 4 altitude bands
 * const y = deck.nextValue(50, 400);        // one value per band per cycle
 * const band = deck.next();                 // raw band index (0..3)
 * ```
 */
export class BalancedDeck {
    /** Total number of bands the range is split into. */
    private readonly numBands: number;

    /** Shuffled band indices (0..numBands-1), drawn one at a time. */
    private deck: number[] = [];

    /** Current position in the deck. */
    private pos = 0;

    constructor(numBands: number) {
        this.numBands = Math.max(1, Math.floor(numBands));
        this.reshuffle();
    }

    /**
     * Refills the deck with band indices 0..numBands-1 and shuffles them.
     */
    private reshuffle(): void {
        this.deck = this.shuffle(
            Array.from({ length: this.numBands }, (_, i) => i)
        );
        this.pos = 0;
    }

    /**
     * Draws the next band index (0..numBands-1).
     * When the deck is exhausted it is reshuffled automatically.
     *
     * @returns band index for the current draw
     */
    next(): number {
        if (this.pos >= this.deck.length) {
            this.reshuffle();
        }
        return this.deck[this.pos++];
    }

    /**
     * Draws the next value between `min` and `max`, guaranteed to fall
     * in a different band than the previous `numBands` draws (no clumping).
     * A small random jitter inside the band keeps it looking natural.
     *
     * @param min - lower bound of the range (inclusive)
     * @param max - upper bound of the range (exclusive-ish)
     * @returns balanced-random value in [min, max]
     */
    nextValue(min: number, max: number): number {
        const band = this.next();
        const bandSize = (max - min) / this.numBands;
        return min + (band + Math.random()) * bandSize;
    }

    /**
     * Fisher–Yates in-place shuffle (returns a new array).
     *
     * @param arr - array to shuffle
     * @returns a new shuffled array
     */
    private shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
