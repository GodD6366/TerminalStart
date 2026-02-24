

<p align="center">
  <img src="extension/icon128.png" width="72" alt="TerminalStart Icon">
</p>

<h1 align="center">TerminalStart</h1>

<p align="center">
  Retro-inspired, modular new tab dashboard built for focus and speed.
</p>

<p align="center">
  <a href="https://thecsir.github.io/TerminalStart/">Live Demo</a>
</p>

<p align="center">
  <img src="docs/mainPage.png" width="900" alt="TerminalStart Preview">
</p>

<p align="center">
  <img src="docs/settingsPage.png" width="900" alt="TerminalStart Settings">
</p>

---


## Install in Edge / Chrome

1. Open `edge://extensions` (or `chrome://extensions`)
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `extension` folder


## Todoist Integration

Sync your todo widget with Todoist using a personal API token.

1. Go to **Settings > Advanced > Todo Widget**
2. Enable **Sync with Todoist**
3. Paste your API token (Settings > Integrations > Developer on [todoist.com](https://todoist.com))
4. Grant host permission when prompted

**Due dates** &mdash; add natural language dates when creating tasks:

| Input | Task | Due |
|---|---|---|
| `meet john tomorrow at 2pm` | meet john | tomorrow at 2pm |
| `buy groceries next monday` | buy groceries | next monday |
| `call mom every friday` | call mom | every friday |
| `submit report jan 15` | submit report | jan 15 |

Todoist's NLP handles parsing. Local mode still supports time-only syntax (e.g. `standup 9am`).

### Custom API task filters

If you use **Settings > Advanced > Todo Widget > Custom API**, you can now set task filters for `GET /tasks`:

- Click `[ LOAD /projects ]` to fetch groups from `/api/v1/projects`
- Choose filter mode: include / exclude
- Select groups directly from the fetched list (writes project IDs automatically)
- Include project IDs (`project_ids`)
- Exclude project IDs (`exclude_project_ids`)
- Include project names (`project_names`, case-insensitive on server side)
- Exclude project names (`exclude_project_names`, case-insensitive on server side)

All four fields support comma-separated values and can be combined. The request applies include filters first, then exclude filters.

## Build

### Requirements

* Node.js v16+
* Python 3

### Steps

1. Install dependencies:

```
npm install
```

2. Build:

```
npm run build
```

The build script automatically syncs assets into the `extension/` folder.

3. Package:

```
python scripts/package_addon.py
```

Output: `terminal-start-v1.0.0.zip`

### Testing

```
npx playwright test
```

Runs e2e tests against the extension using Chromium.

## Notes

- Hover over the top right section for settings.
- API tokens are stored locally in your browser and never sent anywhere except the Todoist API.
