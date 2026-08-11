# Change Log

All notable changes to the "vscode-scene" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.2.2]

### Changed
- **Cloud generation improved** — structured, always well-formed clouds:
  fixed overlap ratio proportional to both radii, max 50% neighbour radius
  difference, and mirrored/asymmetric variants.
- **Added Content-Security-Policy (CSP)** in the webview with per-view nonces
  (scripts/styles), `img-src` for extension assets + `data:`, and
  `connect-src` for DevTools source maps.
- **Webpack config hardened** — `splitChunks: false` and
  `dynamicImportMode: 'eager'` so future code (e.g. Pixi) builds into a
  single bundle that stays CSP-compatible.
- **Shared `getNonce()` helper** moved to `src/common/nonce.ts`.
- **Comment cleanup** — consistent, balanced JSDoc across the codebase.

## [0.2.1]

### Added
- New **`vscode-scene.selectScene`** command that opens a QuickPick list of
  all available scenes (Stars, Sky Pilot, Aquarium) so you can switch the
  active scene instantly from the Command Palette.
- A **status-bar icon** (bottom-right, color-wheel `$(symbol-color)`) that
  opens the same scene picker with a single click.
- Selecting a scene also enables the view if it was disabled (only after you
  confirm a choice — pressing Escape makes no changes).
- The currently active scene is marked with a checkmark in the picker.

## [0.2.0]

### Added
- New **Aquarium** scene: a pure Canvas2D fish tank with 6 cartoon fish sprites
  (one of each type), animated wagging tails, fish-blown bubbles, a tiled
  background image, and gentle shimmering caustics.

## [0.1.1] - Initial release

### Added
- **Stars** scene: a pure Canvas2D starfield with twinkling stars, a glowing
  moon, shooting stars, and an animated bird.
- **SkyPilot** scene: a Pixi.js sky with procedurally generated clouds and
  colorful airplanes with spinning propellers.
- Explorer webview panel with live scene switching via the
  `vscode-scene.screen` setting.
