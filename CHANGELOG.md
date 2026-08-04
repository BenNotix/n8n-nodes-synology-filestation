# Changelog

All notable changes to `n8n-nodes-synology-filestation` are documented in this file.

## [1.2.0] - 2026-08-04

### Added

- **Synology Cloud Sync** node (same credential): monitor and control the Cloud Sync package. Connections (list with sync status, get settings and cloud info, pause/resume one or all, filterable sync logs with pagination, unlink), sync tasks (list folder pairs with status, remove) and reports (package configuration, recently synchronized files). Usable as an AI Agent tool.
- Explicit error message when the Cloud Sync package is not installed on the NAS, instead of DSM's generic "requested API does not exist".

### Notes

- The Cloud Sync API is not officially documented by Synology; the node uses the same reverse-engineered `SYNO.CloudSync` endpoints as the DSM web UI (confirmed identical on DSM 6 and DSM 7). Creating connections or sync tasks (OAuth flows) is out of scope.

## [1.1.1] - 2026-08-03

### Changed

- Wording pass over the whole UI for consistent, professional English: "share link" everywhere (was mixed with "sharing link"), "Get Folder Size" (was "Get Directory Size"), "Refresh" compress mode label (was the raw API value "Refreshen"), "Task Type" filter for background tasks (was "API Filter"), aligned File Type and Pattern descriptions across the action and trigger nodes, and clearer DSM error messages (reworded the awkward verbatim strings from the official error tables).
- Long-running operations now return a consistent shape: Copy/Move, Compress and Extract include `success: true` and echo the operated paths, like Delete already did.
- README: new Compatibility section, corrected manual-install instructions (`~/.n8n/nodes`), the "Watch a folder" example now uses the Trigger node, and a Version history section points to this changelog.

### Fixed

- Share Link → Create now resolves the Sharing-specific error codes (2000–2002) and attaches the path-format hint, like every other operation.
- The Search: Find operation and the trigger share one search implementation with a single polling interval.

## [1.1.0] - 2026-08-03

### Added

- **Synology File Station Trigger** node: starts workflows on *File Created*, *File Updated* or *File Created or Updated* events. Watches a folder (subfolders optional) with pattern/extension/type filters, polling through NAS-side searches. The cursor is built on NAS timestamps with the NAS's own clock as reference, an overlap window and per-path deduplication — robust to clock drift, slow recursive scans, same-second bursts and files copied in with a preserved modification time.
- **File → Exists** operation: returns `exists: true/false` (and `isdir`) instead of failing when the path is absent.
- **AI agent support** documented: the node is exposed as an AI Agent tool (`usableAsTool`); resources now carry descriptions to help LLM tool selection. Requires `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` on self-hosted n8n.

### Changed

- The node and credential icons now use the official Synology wordmark (light and dark variants).

## [1.0.3] - 2026-08-03

### Fixed

- The path-format hint (macOS `/Volumes/…` and internal `/volumeN/…` paths) now also appears on **per-file** errors — the way DSM actually reports an unknown path to `get`, `download`, `rename` and folder `create` (e.g. "No such file or directory (error 408)"). Previously the hint was only attached to top-level API errors.

## [1.0.2] - 2026-08-03

### Fixed

- Path parameters are now normalized before being sent to the NAS: wrapping shell quotes (from paths pasted out of Finder or a terminal) are stripped and a missing leading slash is added.
- Clear, actionable errors for the most common path mistakes instead of DSM's generic "Unknown error of file operation (401)": macOS mount paths (`/Volumes/…`) and internal volume paths (`/volume1/…`) are flagged with an explanation when a request fails, and Windows-style paths (`C:\…`, `\\NAS\…`) are rejected upfront.

## [1.0.1] - 2026-08-03

### Added

- **Custom Headers** option in the Synology API credential: extra HTTP headers sent with every request to the NAS — API discovery, login/logout, JSON and binary requests, multipart uploads and the credential test. Main use case: DSM exposed through a Cloudflare Tunnel protected by Cloudflare Access, which requires the `CF-Access-Client-Id` / `CF-Access-Client-Secret` service-token headers on each request. Header names and values are stripped of CR/LF characters.
- New "Reaching a NAS from a remote n8n" section in the README: Tailscale/WireGuard VPN, Cloudflare Tunnel (+ Access via Custom Headers), Synology DDNS with Let's Encrypt, and why QuickConnect cannot work.

## [1.0.0] - 2026-08-03

Initial release.

### Added

- **Synology API credential** with session-based login (`SYNO.API.Auth`, `format=sid`), programmatic connection test with precise error messages, and optional SSL validation bypass for self-signed certificates.
- **Synology File Station node** — 8 resources, 33 operations:
  - **File**: upload (RFC 1867 multipart), download (streamed, folders as ZIP), copy, move, rename, delete, get
  - **Folder**: create, delete, get many (contents with glob/sort/filters), list shares
  - **Share Link**: create, get, get many, update, delete, clear invalid
  - **Search**: server-side find with filters (pattern, extension, type, size and date ranges, owner, group) — starts the task, polls, collects and cleans up
  - **Archive**: compress (zip/7z), extract, list contents
  - **Utility**: check write permission, directory size, File Station info, MD5, thumbnail
  - **Favorite**: add, update, delete, get many, clear broken
  - **Background Task**: get many, clear finished
- Runtime discovery of API paths and versions through `SYNO.API.Info` — DSM 6 and DSM 7 supported with the same credential.
- Non-blocking NAS tasks (copy/move/delete/compress/extract/search) are polled to completion with a configurable timeout, or can return their task ID immediately.
