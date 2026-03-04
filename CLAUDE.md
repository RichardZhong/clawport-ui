# ClawPort -- Developer Guide

## Quick Reference

```bash
npm run setup        # Auto-detect OpenClaw config, write .env.local
npm run dev          # Start dev server (Turbopack, port 3000)
npm test             # Run all 288 tests via Vitest (17 suites)
npx tsc --noEmit     # Type-check (expect 0 errors)
npx next build       # Production build
```

### CLI (global install)

```bash
npm install -g clawport-ui
clawport setup       # Auto-detect config, write .env.local into package dir
clawport dev         # Start dev server
clawport start       # Build + start production server
clawport status      # Check gateway reachability + env config
clawport help        # Show usage
```

The CLI resolves its own package root via `import.meta.url`, so all commands work regardless of the user's current working directory. Entry point: `bin/clawport.mjs`.

## Project Overview

ClawPort is a Next.js 16 dashboard for managing OpenClaw AI agents. It provides an org chart (Org Map), direct agent chat with multimodal support, cron monitoring, and memory browsing. All AI calls route through the OpenClaw gateway -- no separate API keys needed.

## Tech Stack

- Next.js 16.1.6 (App Router, Turbopack)
- React 19.2.3, TypeScript 5
- Tailwind CSS 4 with CSS custom properties for theming
- Vitest 4 with jsdom environment
- OpenAI SDK (routed to Claude via OpenClaw gateway at localhost:18789)
- React Flow (@xyflow/react) for org chart

## Environment Variables

```env
WORKSPACE_PATH       # Required -- path to .openclaw/workspace
OPENCLAW_BIN         # Required -- path to openclaw binary
OPENCLAW_GATEWAY_TOKEN  # Required -- gateway auth token
ELEVENLABS_API_KEY   # Optional -- voice indicators
```

Run `npm run setup` to auto-detect all required values from your local OpenClaw installation.

## Architecture

### Agent Registry Resolution

```
loadRegistry() checks:
  1. $WORKSPACE_PATH/clawport/agents.json  (user override)
  2. Bundled lib/agents.json            (default)
```

`lib/agents-registry.ts` exports `loadRegistry()`. `lib/agents.ts` calls it to build the full agent list (merging in SOUL.md content from the workspace). Users customize their agent team by dropping an `agents.json` into their workspace -- no source edits needed.

### operatorName Flow

```
OnboardingWizard / Settings page
  -> ClawPortSettings.operatorName (localStorage)
  -> settings-provider.tsx (React context)
  -> NavLinks.tsx (dynamic initials + display name)
  -> ConversationView.tsx (sends operatorName in POST body)
  -> /api/chat/[id] route (injects into system prompt: "You are speaking with {operatorName}")
```

No hardcoded operator names anywhere. Falls back to "Operator" / "??" when unset.

### Chat Pipeline (Text)

```
Client -> POST /api/chat/[id] -> OpenAI SDK -> localhost:18789/v1/chat/completions -> Claude
                                             (streaming SSE response)
```

### Chat Pipeline (Images/Vision)

The gateway's HTTP endpoint strips image_url content. Vision uses the CLI agent pipeline:

```
Client resizes image to 1200px max (Canvas API)
  -> base64 data URL in message
  -> POST /api/chat/[id]
  -> Detects image in LATEST user message only (not history)
  -> execFile: openclaw gateway call chat.send --params <json> --token <token>
  -> Polls: openclaw gateway call chat.history every 2s
  -> Matches response by timestamp >= sendTs
  -> Returns assistant text via SSE
```

Key files: `lib/anthropic.ts` (send + poll logic), `app/api/chat/[id]/route.ts` (routing)

**Why send-then-poll?** `chat.send` is async -- it returns `{runId, status: "started"}` immediately. The `--expect-final` flag doesn't block for this method. We poll `chat.history` until the assistant's response appears.

**Why CLI and not WebSocket?** The gateway WebSocket requires device keypair signing for `operator.write` scope (needed by `chat.send`). The CLI has the device keys; custom clients don't.

**Why resize to 1200px?** macOS ARG_MAX is 1MB. Unresized photos can produce multi-MB base64 that exceeds CLI argument limits (E2BIG error). 1200px JPEG at 0.85 quality keeps base64 well under 1MB.

### Voice Message Pipeline

```
Browser MediaRecorder (webm/opus or mp4)
  -> AudioContext AnalyserNode captures waveform (40-60 samples)
  -> Stop -> audioBlob + waveform data
  -> POST /api/transcribe (Whisper via gateway)
  -> Transcription text sent as message content
  -> Audio data URL + waveform stored in message for playback
```

Key files: `lib/audio-recorder.ts`, `lib/transcribe.ts`, `components/chat/VoiceMessage.tsx`

### Conversation Persistence

Messages stored in localStorage as JSON. Media attachments are base64 data URLs (not blob URLs -- those don't survive reload). The `conversations.ts` module provides `addMessage()`, `updateLastMessage()`, and `parseMedia()`.

### Theming

Five themes defined via CSS custom properties in `app/globals.css`:
- Dark (default), Glass, Color, Light, System
- Components use semantic tokens: `--bg`, `--text-primary`, `--accent`, `--separator`, etc.
- Theme state managed by `app/providers.tsx` ThemeProvider (localStorage)

## Onboarding

`components/OnboardingWizard.tsx` -- 5-step first-run setup wizard:

1. **Welcome** -- portal name, subtitle, operator name (with live sidebar preview)
2. **Theme** -- pick from available themes (applies live)
3. **Accent Color** -- color preset grid
4. **Voice Chat** -- microphone permission test (optional)
5. **Overview** -- feature summary (Agent Map, Chat, Kanban, Crons, Memory)

**First-run detection:** checks `localStorage('clawport-onboarded')`. If absent, wizard shows automatically.

**Mounting:** `OnboardingWizard` is rendered in `app/layout.tsx` (always present, self-hides when not needed).

**Re-run:** settings page has a button that renders `<OnboardingWizard forceOpen onClose={...} />`. When `forceOpen` is true, the wizard pre-populates from current settings and does not set `clawport-onboarded` on completion.

## Environment Safety

`lib/env.ts` exports `requireEnv(name)` -- throws a clear error with the missing variable name and a pointer to `.env.example`.

**Critical pattern:** call `requireEnv()` inside functions, never at module top level. This prevents imports from crashing during `next build` or test runs when env vars are not set.

Used by: `lib/memory.ts`, `lib/cron-runs.ts`, `lib/kanban/chat-store.ts`, `lib/crons.ts`

## File Map

### API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents` | GET | All agents from registry + SOUL.md |
| `/api/chat/[id]` | POST | Agent chat -- text (streaming) or vision (send+poll) |
| `/api/crons` | GET | Cron jobs via `openclaw cron list --json` |
| `/api/memory` | GET | Memory files from workspace |
| `/api/tts` | POST | Text-to-speech via OpenClaw |
| `/api/transcribe` | POST | Audio transcription via Whisper |

### Core Libraries

| File | Purpose |
|------|---------|
| `lib/agents.ts` | Agent list builder -- calls `loadRegistry()`, merges SOUL.md |
| `lib/agents-registry.ts` | `loadRegistry()` -- workspace override -> bundled fallback |
| `lib/agents.json` | Bundled default agent registry |
| `lib/anthropic.ts` | Vision pipeline: `hasImageContent`, `extractImageAttachments`, `buildTextPrompt`, `sendViaOpenClaw` (send + poll), `execCli` |
| `lib/audio-recorder.ts` | `createAudioRecorder()` -- MediaRecorder + waveform via AnalyserNode |
| `lib/conversations.ts` | Conversation store with localStorage persistence |
| `lib/crons.ts` | Cron data fetching via CLI |
| `lib/env.ts` | `requireEnv(name)` -- safe env var access with clear errors |
| `lib/multimodal.ts` | `buildApiContent()` -- converts Message+Media to OpenAI API format |
| `lib/settings.ts` | `ClawPortSettings` type, `loadSettings()`, `saveSettings()` (localStorage) |
| `lib/transcribe.ts` | `transcribe(audioBlob)` -- Whisper API with graceful fallback |
| `lib/validation.ts` | `validateChatMessages()` -- validates text + multimodal content arrays |

### Chat Components

| Component | Purpose |
|-----------|---------|
| `ConversationView.tsx` | Main chat: messages, input, recording, paste/drop, file staging. Sends `operatorName` in POST body. |
| `VoiceMessage.tsx` | Waveform playback: play/pause + animated bar visualization |
| `FileAttachment.tsx` | File bubble: icon by type + name + size + download |
| `MediaPreview.tsx` | Pre-send strip of staged attachments with remove buttons |
| `AgentList.tsx` | Desktop agent sidebar with unread badges |

### Other Components

| Component | Purpose |
|-----------|---------|
| `OnboardingWizard.tsx` | 5-step first-run setup wizard (name, theme, accent, mic, overview) |
| `NavLinks.tsx` | Sidebar nav with dynamic operator initials + name from settings |
| `Sidebar.tsx` | Sidebar layout shell |
| `AgentAvatar.tsx` | Agent emoji/image avatar with optional background |
| `DynamicFavicon.tsx` | Updates favicon based on portal emoji/icon settings |

### Scripts & CLI

| File | Purpose |
|------|---------|
| `bin/clawport.mjs` | CLI entry point -- `clawport dev`, `clawport setup`, `clawport status`, etc. Resolves package root via `import.meta.url` |
| `scripts/setup.mjs` | `npm run setup` / `clawport setup` -- auto-detects WORKSPACE_PATH, OPENCLAW_BIN, gateway token; writes `.env.local`. Accepts `--cwd=<path>` flag for CLI usage |

## Testing

17 test suites, 288 tests total. All in `lib/` directory.

```bash
npx vitest run                     # All tests
npx vitest run lib/anthropic.test.ts  # Single suite
npx vitest --watch                  # Watch mode
```

Key test patterns:
- `vi.mock('child_process')` for CLI tests (anthropic.ts)
- `vi.useFakeTimers({ shouldAdvanceTime: true })` for polling tests
- `vi.stubEnv()` for environment variable tests
- jsdom environment for DOM-dependent tests

## Conventions

- No external charting/media libraries -- native Web APIs (Canvas, MediaRecorder, AudioContext)
- Base64 data URLs for all persisted media (not blob URLs)
- CSS custom properties for theming -- no Tailwind color classes directly
- Inline styles referencing CSS vars (e.g., `style={{ color: 'var(--text-primary)' }}`)
- Tests colocated with source: `lib/foo.ts` + `lib/foo.test.ts`
- Agent chat uses `claude-sonnet-4-6` model via OpenClaw gateway
- No em dashes in agent responses (enforced via system prompt)
- Call `requireEnv()` inside functions, not at module top level
- No hardcoded operator names -- use `operatorName` from settings context

## Common Tasks

### Add a new agent
Edit `lib/agents.json` (or drop a custom `agents.json` into `$WORKSPACE_PATH/clawport/`). Auto-appears in map, chat, and detail pages.

### Customize agents for your workspace
Create `$WORKSPACE_PATH/clawport/agents.json` with your own agent entries. ClawPort loads this instead of the bundled default. Format matches `lib/agents.json`.

### Re-run onboarding wizard
Go to Settings page and click "Re-run Setup Wizard". This opens the wizard with `forceOpen` so it pre-populates current values and does not reset the `clawport-onboarded` flag.

### Add a new setting field
1. Add the field to `ClawPortSettings` interface in `lib/settings.ts`
2. Add a default value in `DEFAULTS`
3. Add parsing logic in `loadSettings()`
4. Add a setter method in `app/settings-provider.tsx`
5. Consume via `useSettings()` hook in components

### Change the chat model
Edit `app/api/chat/[id]/route.ts` -- change the `model` field in `openai.chat.completions.create()`.

### Add a new theme
Add a `[data-theme="name"]` block in `app/globals.css` with all CSS custom properties. Add the theme ID to `lib/themes.ts`.

### Debug image pipeline
1. Check server console for `sendViaOpenClaw execFile error:` or `sendViaOpenClaw: timed out`
2. Test CLI directly: `openclaw gateway call chat.send --params '{"sessionKey":"agent:main:clawport","idempotencyKey":"test","message":"describe","attachments":[]}' --token <token> --json`
3. Check history: `openclaw gateway call chat.history --params '{"sessionKey":"agent:main:clawport"}' --token <token> --json`
4. Verify gateway is running: `openclaw gateway call health --token <token>`
