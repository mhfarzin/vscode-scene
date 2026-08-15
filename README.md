# VS Code Scene ✨

Bring beautiful animated scenes to your VS Code Explorer sidebar.

Transform your editor into a relaxing, living workspace with smooth animated scenes. Watch twinkling stars drift across a peaceful night sky, enjoy colorful airplanes gliding through soft clouds, or relax with cute cartoon fish swimming in a bubbling aquarium—all without leaving VS Code.

Whether you're coding, taking a short break, or simply want a more enjoyable workspace, VS Code Scene adds subtle motion to your Explorer sidebar.

---

## 🎬 Preview

### ✈️ SkyPilot

![SkyPilot Demo](https://codeberg.org/mhfarzin/assets/raw/branch/main/vscode-scene/sky-pilot.gif)

### 🌟 Stars

![Stars Demo](https://codeberg.org/mhfarzin/assets/raw/branch/main/vscode-scene/stars.gif)

### 🐠 Aquarium

![Aquarium Demo](https://codeberg.org/mhfarzin/assets/raw/branch/main/vscode-scene/aquarium.gif)

---

## ✨ Features

### ✈️ SkyPilot

A pure Canvas2D sky scene featuring **procedurally generated drifting clouds** and **colorful airplanes** (Blue, Green, Red, and Yellow) flying smoothly across the screen with spinning propellers.

### 🐠 Aquarium

A pure Canvas2D fish tank featuring **6 cartoon fish** (one of each sprite type) swimming around with **animated wagging tails**, bubbles blown from each fish's mouth, a tiled background, and gentle shimmering caustics.

### 🌟 Stars

A pure Canvas2D animated starfield featuring **115 twinkling stars** (90 tiny background stars + 25 vivid five-pointed stars) that slowly drift upward, each with its own unique brightness pattern.

---

## 🖱️ How to Use

1. Open the **Explorer** view.
2. Locate the **Scene** panel at the bottom of the Explorer.
3. Enjoy the animation—it starts automatically.

You can also use the Command Palette (`Ctrl+Shift+P`), or click the
**color-wheel icon** in the bottom status bar:

| Command | Description |
|---|---|
| **VS Code Scene: Start** | Opens the Explorer and displays the Scene panel |
| **VS Code Scene: Stop** | Closes the Explorer sidebar and hides the Scene |
| **VS Code Scene: Select Scene** | Opens a picker to switch the active scene (Stars, Sky Pilot, Aquarium) |
| *(status-bar icon)* | Click the 🎨 color-wheel in the bottom bar for the same scene picker |

---

## ⚙️ Settings

This extension contributes the following setting:

| Setting | Description | Default |
|---|---|---|
| `vscode-scene.screen` | Select the scene to display (`stars`, `sky-pilot`, or `aquarium`) | `sky-pilot` |
| `vscode-scene.enabled` | Whether the Scene view is shown in the Explorer | `true` |

Change the active scene from **Settings → Extensions → Scene**. The animation updates instantly—no reload required.

---

## ⚡ Performance

All scenes are pure Canvas2D — no external rendering library. The webview
bundle is tiny (~25 KB gzipped), animations pause when the view is hidden,
and memory usage stays low.

Use the **VS Code Scene: Stop** command when you do not need the animation, especially on systems with limited resources.

---

## 🔒 Privacy

VS Code Scene does not collect personal data, track users, or send data to external services.

The webview runs under a strict **Content-Security-Policy** with per-view
nonces, so only the extension's own scripts and styles can execute.

---

## ✅ Requirements

No additional dependencies or configuration are required.

---

## 🎨 Icon

The extension icon combines the available scenes: a deep night sky with a glowing moon and stars alongside a tiny airplane flying across the horizon.

---

## Credits

This extension uses assets from the following creators:

* **Game Assets & UI Elements:** Created by [Kenney](https://kenney.nl)
* **Graphics & Icons:** Designed by [Freepik](https://www.freepik.com)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🐛 Issues & Feedback

Found a bug or have an idea for a new scene?

Open an issue on GitHub:
https://github.com/mhfarzin/vscode-scene/issues

---

Enjoy your scenes! ✨
