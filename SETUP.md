# ClawPort -- Setup Guide

This guide walks you through getting ClawPort running against your own OpenClaw instance. If you just want the quick version, see the [README](README.md).

---

## Prerequisites

1. **Node.js 22+** -- [Download](https://nodejs.org). Verify with `node -v`.
2. **OpenClaw** -- [Install OpenClaw](https://openclaw.ai) and make sure the CLI works: `openclaw --version`.
3. **OpenClaw gateway running** -- ClawPort talks to the gateway at `localhost:18789`. Start it before launching the UI.

---

## 1. Install ClawPort

```bash
# Install globally from npm
npm install -g clawport-ui

# Or clone the repo
git clone https://github.com/JohnRiceML/clawport-ui.git
cd clawport-ui
npm install
```

---

## 2. Configure Environment

The fastest way is the auto-setup script:

```bash
# If installed globally via npm
clawport setup

# Or if running from source
npm run setup
```

This auto-detects your `WORKSPACE_PATH`, `OPENCLAW_BIN`, and gateway token from your local OpenClaw installation, shows you what it found, and writes `.env.local` after you confirm.

If you prefer to configure manually, copy the template and edit:

```bash
cp .env.example .env.local
```

Open `.env.local` in your editor and set the three required variables.

### WORKSPACE_PATH

The path to your OpenClaw workspace directory. This is where OpenClaw stores agent SOUL files, memory, and other data.

**Default location:** `~/.openclaw/workspace`

To verify:

```bash
ls ~/.openclaw/workspace
```

You should see files like `SOUL.md`, an `agents/` directory, and a `memory/` directory. Use the full absolute path in your `.env.local`:

```env
WORKSPACE_PATH=/Users/yourname/.openclaw/workspace
```

### OPENCLAW_BIN

The absolute path to the `openclaw` CLI binary. ClawPort calls this binary for vision messages, cron listing, and other CLI operations.

To find it:

```bash
which openclaw
```

Use whatever that returns:

```env
OPENCLAW_BIN=/usr/local/bin/openclaw
```

If you installed via nvm or a version manager, the path might be something like `/Users/yourname/.nvm/versions/node/v22.14.0/bin/openclaw`. That's fine -- just use the full path.

### OPENCLAW_GATEWAY_TOKEN

The token that authenticates all API calls to the OpenClaw gateway. Every request ClawPort makes (chat, vision, TTS, transcription) includes this token.

To find it:

```bash
openclaw gateway status
```

This should display your gateway configuration including the token. Copy it into your `.env.local`:

```env
OPENCLAW_GATEWAY_TOKEN=your-token-here
```

### ELEVENLABS_API_KEY (optional)

If you want voice indicators on agent profiles, add your ElevenLabs API key. Get one at [elevenlabs.io](https://elevenlabs.io).

```env
ELEVENLABS_API_KEY=sk_your-key-here
```

If you skip this, everything works normally. Voice indicators just won't appear.

---

## 3. Start the Gateway

ClawPort expects the OpenClaw gateway to be running at `localhost:18789`. Start it in a separate terminal:

```bash
openclaw gateway run
```

Leave this running while you use ClawPort. If the gateway isn't running, chat and all AI features will fail with connection errors.

---

## 4. Run ClawPort

```bash
# If installed globally via npm
clawport dev

# Or if running from source
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### First-Run Onboarding

On your first visit, ClawPort launches the **onboarding wizard**. This walks you through:

- **Naming your portal** -- give your command centre a custom name and subtitle
- **Choosing a theme** -- pick from Dark, Glass, Color, Light, or System
- **Setting an accent color** -- personalize the UI highlight color
- **Customizing your logo** -- upload an icon or choose an emoji
- **Entering your name** -- so the UI knows who the operator is

All of these can be changed later in the Settings page. The wizard just gets you started quickly.

---

## 5. Agent Customization

### Using the Bundled Registry

ClawPort ships with a default agent registry at `lib/agents.json`. This is a working example showing a full team hierarchy. It works out of the box if your OpenClaw workspace has matching agent SOUL files.

### Using Your Own Agents

To define your own agent team, create a file at:

```
$WORKSPACE_PATH/clawport/agents.json
```

For example, if your `WORKSPACE_PATH` is `/Users/yourname/.openclaw/workspace`:

```bash
mkdir -p /Users/yourname/.openclaw/workspace/clawport
```

Then create `agents.json` in that directory. ClawPort checks for this file on every request. If it exists, it replaces the bundled registry entirely. If it's missing or contains invalid JSON, the bundled default is used as a fallback.

### Agent Entry Format

Your `agents.json` should be an array of agent objects. Here's the minimal required shape:

```json
[
  {
    "id": "my-agent",
    "name": "My Agent",
    "title": "What this agent does",
    "reportsTo": null,
    "directReports": [],
    "soulPath": "agents/my-agent/SOUL.md",
    "voiceId": null,
    "color": "#06b6d4",
    "emoji": "🤖",
    "tools": ["read", "write"],
    "memoryPath": null,
    "description": "One-liner about this agent."
  }
]
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique slug for the agent (e.g., `"vera"`) |
| `name` | string | Display name (e.g., `"VERA"`) |
| `title` | string | Role title (e.g., `"Chief Strategy Officer"`) |
| `reportsTo` | string or null | Parent agent `id` for the org chart. `null` for the root. |
| `directReports` | string[] | Array of child agent `id`s |
| `soulPath` | string or null | Path to the agent's SOUL.md, relative to `WORKSPACE_PATH` |
| `voiceId` | string or null | ElevenLabs voice ID (requires `ELEVENLABS_API_KEY`) |
| `color` | string | Hex color for the agent's node in the Org Map |
| `emoji` | string | Emoji shown as the agent's avatar |
| `tools` | string[] | List of tools this agent has access to |
| `memoryPath` | string or null | Path to agent-specific memory (relative to `WORKSPACE_PATH`) |
| `description` | string | One-line description shown in the UI |

### Hierarchy Rules

- Exactly one agent should have `"reportsTo": null` -- this is your root/orchestrator node.
- `directReports` should be consistent with `reportsTo`. If agent B reports to agent A, then A's `directReports` should include B's `id`.
- The Org Map uses these relationships to build the org chart automatically.

### Example: Minimal Two-Agent Setup

```json
[
  {
    "id": "boss",
    "name": "Boss",
    "title": "Orchestrator",
    "reportsTo": null,
    "directReports": ["worker"],
    "soulPath": "SOUL.md",
    "voiceId": null,
    "color": "#f5c518",
    "emoji": "👑",
    "tools": ["read", "write", "exec", "message"],
    "memoryPath": null,
    "description": "Top-level orchestrator."
  },
  {
    "id": "worker",
    "name": "Worker",
    "title": "Task Runner",
    "reportsTo": "boss",
    "directReports": [],
    "soulPath": "agents/worker/SOUL.md",
    "voiceId": null,
    "color": "#22c55e",
    "emoji": "⚙️",
    "tools": ["read", "write"],
    "memoryPath": null,
    "description": "Handles assigned tasks."
  }
]
```

---

## 6. Production Build

```bash
# If installed globally via npm
clawport start

# Or if running from source
npx next build
npm start
```

The production server runs on port 3000 by default. The gateway still needs to be running at `localhost:18789`.

---

## Troubleshooting

### "Missing required environment variable: WORKSPACE_PATH"

Your `.env.local` is missing or the variable isn't set. Make sure you copied `.env.example`:

```bash
cp .env.example .env.local
```

Then fill in the values. Restart the dev server after changing `.env.local`.

### Gateway connection refused / chat not working

The OpenClaw gateway isn't running. Start it:

```bash
openclaw gateway run
```

Verify it's reachable:

```bash
curl http://localhost:18789/v1/models
```

You should get a JSON response. If not, check that nothing else is using port 18789.

### No agents showing up

1. **Check `WORKSPACE_PATH`** -- make sure it points to a valid OpenClaw workspace directory.
2. **Check your agents.json** -- if you placed a custom `agents.json` at `$WORKSPACE_PATH/clawport/agents.json`, make sure it's valid JSON. A syntax error will cause a silent fallback to the bundled registry. Test with:
   ```bash
   cat $WORKSPACE_PATH/clawport/agents.json | python3 -m json.tool
   ```
3. **Check the server console** -- ClawPort logs errors to the terminal where `npm run dev` is running.

### Agent SOUL.md not loading

The `soulPath` in your agents.json is relative to `WORKSPACE_PATH`. If your workspace is at `/Users/you/.openclaw/workspace` and `soulPath` is `"agents/vera/SOUL.md"`, ClawPort will look for `/Users/you/.openclaw/workspace/agents/vera/SOUL.md`.

Make sure the file exists at that path.

### Images not working in chat

Image messages use the CLI pipeline (`openclaw gateway call chat.send`). Common issues:

1. **`OPENCLAW_BIN` path is wrong** -- run `which openclaw` and update `.env.local`.
2. **Gateway token is wrong** -- verify with `openclaw gateway status`.
3. **Image too large** -- ClawPort resizes to 1200px max, but extremely large images may still hit limits. Try a smaller image.

Check the server console for errors like `sendViaOpenClaw execFile error:` or `E2BIG`.

### Voice/TTS features not working

Voice features require `ELEVENLABS_API_KEY` in your `.env.local`. Without it, voice indicators won't appear on agent profiles.

Audio transcription (speech-to-text) uses Whisper through the OpenClaw gateway and does not require a separate key.

### Port 3000 already in use

Another process is using port 3000. Either stop it or run ClawPort on a different port:

```bash
npm run dev -- -p 3001
```

---

## Running Tests

```bash
npm test             # Run all tests via Vitest
npx tsc --noEmit     # Type-check (expect 0 errors)
```

---

## Developer Guide

For architecture deep-dives, test patterns, and contribution conventions, see [CLAUDE.md](CLAUDE.md).
