# Changelog

All notable changes to [clawport-ui](https://www.npmjs.com/package/clawport-ui) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.3] - 2026-03-05

### Changed

- Added clawport.dev link to README header.

## [0.5.2] - 2026-03-04

### Fixed

- Agent discovery now uses SOUL.md-driven scanning for subdirectory agents, replacing fragile directory-name matching.

## [0.5.1] - 2026-03-03

### Changed

- Rewrote CLI discovery to use real `openclaw agents list` output format.

## [0.5.0] - 2026-03-02

### Added

- CLI-based agent discovery via `openclaw agents list`.
- Dagre-powered org map with team-column layout.

### Fixed

- Deduplicated root agent when `agents/` directory name matches root ID.

## [0.4.6] - 2026-02-28

### Added

- Setup detection module with comprehensive setup scenario tests.

## [0.4.5] - 2026-02-27

### Fixed

- Handle `{ crons, pipelines }` response format in all consumers.

## [0.4.4] - 2026-02-26

### Fixed

- Split cron-pipelines module to avoid `fs` import in client bundle.

## [0.4.3] - 2026-02-25

### Added

- Rebuilt Memory page as 3-tab dashboard with live config viewer.

### Changed

- Documentation: added 405 troubleshooting, auto-discovery info, fixed clone URL.

### Fixed

- Detect and auto-enable gateway HTTP endpoint during setup.
- Rewrote agent auto-discovery to handle all OpenClaw heading formats.

## [0.4.2] - 2026-02-24

### Added

- Auto-discover agents from OpenClaw workspace.
- Kanban board hardening.

### Changed

- Default accent color to red; clarified package vs CLI naming.

## [0.4.1] - 2026-02-23

### Fixed

- Set `turbopack.root` to package directory for global installs.
- Moved Next.js build dependencies to `dependencies` for global installs.
- Converted `next.config.ts` to `next.config.mjs` for global installs.
- Use package-local `next` binary instead of `npx` in CLI.

## [0.2.0] - 2026-02-20

### Added

- CLI entry point (`bin/clawport.mjs`) with `clawport dev`, `clawport setup`, `clawport start`, `clawport status`, and `clawport help` commands.
- Published `clawport-ui` to npm with default lobster emoji.
- MIT LICENSE file and repository URLs for open-source readiness.
- Lucide icons on all action buttons with dynamic accent contrast.
- Onboarding wizard (5-step first-run setup: name, theme, accent, mic, overview).

### Changed

- Rebranded from Agent Claw / Manor UI to ClawPort throughout the codebase.
- Renamed ManorMap component and stripped voice IDs.

## [0.1.3] - 2026-02-17

### Added

- Kanban board with agent automation (V2).

### Changed

- Comprehensive README, CLAUDE.md, and `.env.example` update.

### Removed

- Voice recording and audio playback from chat.

### Fixed

- `sendViaOpenClaw` uses send-then-poll pattern for `chat.send`.
- Image pipeline: resize client-side, use CLI `execFile`, check only latest message.

## [0.1.2] - 2026-02-14

### Added

- Route image messages through OpenClaw `chat.send` pipeline.
- TDD coverage for multimodal, validation, and audio-recorder modules.
- Multimodal chat with vision and file support, plus TTS listen button.
- Voice messages, file attachments, and enhanced media input.

### Fixed

- Use WebSocket for image messages instead of CLI (fixes E2BIG).
- Return plain string for audio-only messages in `buildApiContent`.

## [0.1.1] - 2026-02-11

### Added

- Complete Apple-quality UI/UX remake.
- Security hardening and test infrastructure.
- Messenger-style chat with avatars, name labels, and markdown formatting.
- Full Messenger rebuild with persistent threads, all agents, and media support.
- 5-theme system (Dark, Glass, Color, Light, System) with visible map connectors.

### Fixed

- Removed hardcoded OpenClaw gateway token.
- Chat via OpenClaw gateway using `claude-sonnet-4-6` (no separate API key required).

### Changed

- Apple dark mode full pass: glass chat, line numbers, gold gradients, animated states.

## [0.1.0] - 2026-02-07

### Added

- Initial release.
- Agent org map with React Flow.
- Call box for direct agent chat.
- Cron monitor dashboard.
- Memory browser.
- Next.js 16 App Router with Turbopack.

[0.5.3]: https://github.com/JohnRiceML/clawport-ui/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/JohnRiceML/clawport-ui/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/JohnRiceML/clawport-ui/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/JohnRiceML/clawport-ui/compare/v0.4.6...v0.5.0
[0.4.6]: https://github.com/JohnRiceML/clawport-ui/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/JohnRiceML/clawport-ui/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/JohnRiceML/clawport-ui/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/JohnRiceML/clawport-ui/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/JohnRiceML/clawport-ui/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/JohnRiceML/clawport-ui/compare/v0.2.0...v0.4.1
[0.2.0]: https://github.com/JohnRiceML/clawport-ui/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/JohnRiceML/clawport-ui/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/JohnRiceML/clawport-ui/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/JohnRiceML/clawport-ui/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/JohnRiceML/clawport-ui/releases/tag/v0.1.0
