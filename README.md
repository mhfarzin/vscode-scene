# VS Code Scene ✨

Bring beautiful animated scenes to your VS Code Explorer sidebar.

Transform your editor into a relaxing, living workspace with smooth animated scenes. Watch twinkling stars drift across a peaceful night sky or enjoy colorful airplanes gliding through soft clouds—all without leaving VS Code.

Whether you're coding, taking a short break, or simply want a more enjoyable workspace, VS Code Scene adds subtle motion to your Explorer sidebar.

---

## 🎬 Preview

### ✈️ SkyPilot

![SkyPilot Demo](https://i.imgur.com/aPbSsMg.gif)

### 🌟 Stars

![Stars Demo](https://i.imgur.com/dISVtMh.gif)

---

## ✨ Features

### 🌟 Stars

A pure Canvas2D animated starfield featuring **200 twinkling stars** that slowly drift upward, each with its own unique brightness pattern.

### ✈️ SkyPilot

A Pixi.js-powered sky scene featuring **procedurally generated drifting clouds** and **colorful airplanes** (Blue, Green, Red, and Yellow) flying smoothly across the screen with spinning propellers.

---

## 🖱️ How to Use

1. Open the **Explorer** view.
2. Locate the **Scene** panel at the bottom of the Explorer.
3. Enjoy the animation—it starts automatically.

You can also use the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---|---|
| **VS Code Scene: Start** | Opens the Explorer and displays the Scene panel |
| **VS Code Scene: Stop** | Closes the Explorer sidebar and hides the Scene |

---

## ⚙️ Settings

This extension contributes the following setting:

| Setting | Description | Default |
|---|---|---|
| `vscode-scene.screen` | Select the scene to display (`stars` or `sky-pilot`) | `sky-pilot` |
| `vscode-scene.enabled` | Whether the Scene view is shown in the Explorer | `true` |

Change the active scene from **Settings → Extensions → Scene**. The animation updates instantly—no reload required.

---

## ⚡ Performance

Animations are rendered only while the Scene view is visible.

Use the **VS Code Scene: Stop** command when you do not need the animation, especially on systems with limited resources.

---

## 🔒 Privacy

VS Code Scene does not collect personal data, track users, or send data to external services.

---

## ✅ Requirements

No additional dependencies or configuration are required.

---

## 🎨 Icon

The extension icon combines both available scenes: a deep night sky with a glowing moon and stars alongside a tiny airplane flying across the horizon.

---

<!-- ## 🚀 Development

```bash
npm install
npm run compile
npm run watch
npm test
```

Launch the Extension Development Host by pressing **F5** in VS Code.

---

## 📦 Publishing

```bash
npx @vscode/vsce package
npx @vscode/vsce publish
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🐛 Issues & Feedback

Found a bug or have an idea for a new scene?

Open an issue on GitHub:
https://github.com/mhfarzin/vscode-scene/issues

--- -->

Enjoy your scenes! ✨
