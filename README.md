# ClawPort

A visual command centre for your AI agent team.

ClawPort is an open-source dashboard for managing, monitoring, and talking directly to your [OpenClaw](https://openclaw.ai) AI agents. Built with Next.js 16, React 19, and a dark command-centre aesthetic with five themes.

---

## Getting Started

### Prerequisites

- [Node.js 22+](https://nodejs.org) (LTS recommended)
- [OpenClaw](https://openclaw.ai) installed and running
- OpenClaw gateway started (`openclaw gateway run`)

### Quick Start (npm)

```bash
# Install globally
npm install -g clawport-ui

# Auto-detect your OpenClaw config
clawport setup

# Start the dev server
clawport dev
```

### Quick Start (from source)

```bash
git clone https://github.com/JohnRiceML/clawport-ui.git
cd clawport-ui
npm install

# Auto-detect your OpenClaw config and write .env.local
npm run setup

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first launch you'll see the **onboarding wizard**, which walks you through naming your portal, choosing a theme, and personalizing agent avatars.

See [SETUP.md](SETUP.md) for detailed environment configuration and troubleshooting.

---

## Features

### Org Map
Interactive org chart of your entire agent team. Nodes show hierarchy, cron status, voice capabilities, and relationships at a glance. Powered by React Flow with BFS-based auto-layout.

### Chat (Call Box)
Full-featured messenger for direct agent conversations:
- **Streaming text chat** via Claude (through the OpenClaw gateway)
- **Image attachments** with vision -- agents can see and describe images
- **Voice messages** -- hold-to-record with waveform playback
- **File attachments** -- PDFs, docs, text files with type-aware rendering
- **Clipboard paste and drag-and-drop** for images
- **Clear chat** per agent
- Conversations persist to localStorage

### Agent Detail
Full profile: SOUL.md viewer, tool list, hierarchy, associated crons, voice ID, and direct chat link.

### Kanban
Task board for managing work across your agent team. Drag-and-drop cards with agent assignment and chat context.

### Cron Monitor
Live status of all scheduled jobs. Filter by status (all/ok/error/idle), sort errors to top, expand for error details. Auto-refreshes every 60 seconds.

### Memory Browser
Read team memory, long-term memory, and daily logs. Markdown rendering and JSON syntax highlighting built-in. Search, copy, and download support.

### Settings
Personalize your portal: custom name, subtitle, logo/emoji, accent color, agent avatar overrides, and theme selection. All settings persist in your browser.

---

## Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `WORKSPACE_PATH` | Path to your OpenClaw workspace directory (default: `~/.openclaw/workspace`) |
| `OPENCLAW_BIN` | Path to the `openclaw` CLI binary |
| `OPENCLAW_GATEWAY_TOKEN` | Token that authenticates all API calls to the gateway |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs API key for voice/TTS indicators on agent profiles |

No separate AI API keys are needed. All AI calls (chat, vision, TTS, transcription) route through the OpenClaw gateway.

See [SETUP.md](SETUP.md) for how to find each value.

---

## Agent Customization

ClawPort ships with a bundled agent registry (`lib/agents.json`) as a working example. To use your own agents, create a file at:

```
$WORKSPACE_PATH/clawport/agents.json
```

ClawPort checks for this file on every request. If it exists, it takes priority over the bundled registry. If it's missing or malformed, the bundled default is used as a fallback.

Each agent entry looks like this:

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "title": "What they do",
  "reportsTo": "parent-agent-id",
  "directReports": [],
  "soulPath": "agents/my-agent/SOUL.md",
  "voiceId": null,
  "color": "#06b6d4",
  "emoji": "🤖",
  "tools": ["read", "write"],
  "memoryPath": null,
  "description": "One-liner description of this agent."
}
```

See [SETUP.md](SETUP.md) for the full field reference and examples.

---

## Architecture

### How Chat Works

Text messages go through the OpenClaw gateway's OpenAI-compatible endpoint (`/v1/chat/completions`) for streaming responses.

Image messages use a different pipeline because the gateway's HTTP endpoint strips image data. Instead, ClawPort uses the same path as Discord/Telegram channels:

```
User attaches image
  → Client resizes to 1200px max (fits within OS arg limits)
  → Client converts to base64 data URL
  → POST /api/chat/[id] detects image in latest message
  → Server calls `openclaw gateway call chat.send` via CLI
  → Server polls `openclaw gateway call chat.history` every 2s
  → Agent processes image + text through Anthropic vision API
  → Response returned to client as SSE
```

Voice messages are recorded in-browser using the MediaRecorder API, transcribed server-side via Whisper (through the gateway's `/v1/audio/transcriptions` endpoint), and sent as text with the audio waveform preserved for playback.

### Directory Structure

```
app/
  page.tsx              — Org Map (React Flow org chart)
  chat/page.tsx         — Multi-agent messenger
  agents/[id]/page.tsx  — Agent detail profile
  kanban/page.tsx       — Task board
  crons/page.tsx        — Cron job monitor
  memory/page.tsx       — Memory file browser
  settings/page.tsx     — ClawPort personalization
  api/
    agents/route.ts     — GET agents from registry
    chat/[id]/route.ts  — POST chat (text + vision)
    crons/route.ts      — GET crons via CLI
    memory/route.ts     — GET memory files
    tts/route.ts        — POST text-to-speech
    transcribe/route.ts — POST audio transcription

components/
  OrgMap.tsx            — React Flow graph with auto-layout
  AgentNode.tsx         — Custom node for the org chart
  Sidebar.tsx           — Desktop navigation sidebar
  MobileSidebar.tsx     — Mobile hamburger menu
  ThemeToggle.tsx       — Theme switcher (5 themes)
  GlobalSearch.tsx      — Cmd+K agent search
  chat/
    ConversationView.tsx — Message history + input with media
    AgentList.tsx        — Agent sidebar for chat
    VoiceMessage.tsx     — Waveform playback component
    FileAttachment.tsx   — File bubble with icon + download
    MediaPreview.tsx     — Pre-send attachment strip

lib/
  agents.ts             — Agent registry + SOUL.md reader
  agents-registry.ts    — Registry loader (workspace override or bundled)
  agents.json           — Bundled default agent registry
  anthropic.ts          — OpenClaw vision pipeline (chat.send + poll)
  audio-recorder.ts     — MediaRecorder + waveform extraction
  conversations.ts      — Client-side conversation store (localStorage)
  crons.ts              — Cron data via openclaw CLI
  env.ts                — Environment variable helper
  memory.ts             — Memory file reader
  multimodal.ts         — Message → API content format converter
  sanitize.ts           — HTML/markdown sanitization
  settings.ts           — ClawPort settings (localStorage)
  transcribe.ts         — Whisper transcription with fallback
  validation.ts         — Chat message validation
  types.ts              — Shared TypeScript types
  themes.ts             — Theme definitions
  styles.ts             — Semantic style constants
  utils.ts              — Tailwind merge utility
```

### Key Design Decisions

- **No separate API keys** -- All AI calls (chat, vision, TTS, transcription) route through the OpenClaw gateway. One subscription, one token.
- **No external charting/media libraries** -- Voice waveforms use plain div bars (not canvas), images resize via native Canvas API, all CSS uses Tailwind custom properties.
- **Client-side persistence** -- Conversations stored in localStorage with base64 data URLs. Blob URLs don't survive page reload; data URLs do.
- **Image resize before send** -- Images are resized client-side to max 1200px longest side before base64 encoding. This keeps the CLI argument payload under macOS's 1MB `ARG_MAX` limit.
- **Send-then-poll for vision** -- The gateway's `chat.send` is async (returns immediately). We poll `chat.history` every 2 seconds until the assistant response appears, matched by timestamp.

---

## Themes

Five built-in themes, toggled via the sidebar button:

| Theme | Description |
|-------|-------------|
| **Dark** | Apple Dark Mode with warm blacks, gold accent |
| **Glass** | Frosted translucent panels on deep blue-black |
| **Color** | Vibrant purple-indigo gradients |
| **Light** | Apple Light Mode, clean whites |
| **System** | Follows OS preference |

All themes use CSS custom properties. Components reference semantic tokens (`--bg`, `--text-primary`, `--accent`, etc.) so every theme is automatic.

---

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [React 19](https://react.dev)
- [TypeScript 5](https://typescriptlang.org)
- [Tailwind CSS 4](https://tailwindcss.com)
- [React Flow (@xyflow/react)](https://reactflow.dev) -- Org chart
- [OpenAI SDK](https://github.com/openai/openai-node) -- Gateway client (routed to Claude via OpenClaw)
- [Vitest 4](https://vitest.dev) -- Test runner
- [OpenClaw](https://openclaw.ai) -- AI gateway, agent runtime, vision pipeline

---

## Development

See [CLAUDE.md](CLAUDE.md) for the full developer guide: architecture deep-dives, test patterns, common tasks, and contribution conventions.

```bash
npm run dev          # Start dev server (Turbopack, port 3000)
npm test             # Run all tests via Vitest
npx tsc --noEmit     # Type-check (expect 0 errors)
npx next build       # Production build
```

---

## Built by

[John Rice](https://github.com/johnrice) with [Jarvis](https://openclaw.ai) (OpenClaw AI)

---

## npm

```bash
npm install -g clawport-ui
clawport help
```

Published as [`clawport-ui`](https://www.npmjs.com/package/clawport-ui) on npm.

### CLI Commands

| Command | Description |
|---------|-------------|
| `clawport dev` | Start the development server |
| `clawport start` | Build and start the production server |
| `clawport setup` | Auto-detect OpenClaw config and write `.env.local` |
| `clawport status` | Check gateway reachability and current config |
| `clawport help` | Show usage |

---

## License

MIT
