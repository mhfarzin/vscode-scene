# VS Code Screensaver ✨

Beautiful, relaxing animated scenes right inside your VS Code Explorer sidebar.

Turn your IDE into a calming window — with twinkling stars drifting through a night sky, or a peaceful sky scene with clouds and tiny airplanes flying across. Perfect for breaks, idle moments, or just making your editor feel alive.

---

## ✨ Features

### 🌟 Stars
A pure Canvas2D starfield — **200 twinkling stars** drift slowly upward, each with its own brightness rhythm.

### ✈️ SkyPilot
A Pixi.js sky scene — a light-blue sky with **procedurally generated drifting clouds** and **colorful airplanes** (Blue / Green / Red / Yellow) flying across the screen with spinning propellers.

---

## 🖱️ How to Use

1. Open the **Explorer** view (sidebar).
2. Find the **Screensaver** panel at the bottom of the Explorer.
3. The animation starts automatically.

You can also use the commands from the Command Palette (`Ctrl+Shift+P`):

| Command | What it does |
|---|---|
| **Start Screensaver** | Opens the Explorer to show the screensaver |
| **Stop Screensaver** | Closes the sidebar to hide it |

---

## ⚙️ Settings

This extension contributes the following settings:

| Setting | Description | Default |
|---|---|---|
| `vscode-screensaver.screen` | The screensaver screen to display (`stars` or `sky-pilot`) | `sky-pilot` |

You can change the screen from **Settings → Extensions → Screensaver**, and the scene switches **live** — no reload needed.

---

## 🎨 Icon

The extension icon features a deep night sky with a glowing moon, twinkling stars, and a tiny airplane — tying together both available screens.

---

## 🚀 Development

```bash
npm install        # Install dependencies
npm run compile    # Build the extension (webpack)
npm run watch      # Watch mode
npm test           # Run tests
```

To debug: press `F5` in VS Code to launch the Extension Development Host.

---

## 📦 Publishing

```bash
npx @vscode/vsce package   # Create a .vsix file
npx @vscode/vsce publish   # Publish to the Marketplace
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🐛 Issues & Feedback

Found a bug or have a feature request? Open an issue on [GitHub](https://github.com/mhfarzin/vscode-screensaver/issues).

---

**Enjoy your screensaver!** 🚀
