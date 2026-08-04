# Homework 5 — MCP Servers (GitHub · Filesystem · Notion · Custom FastMCP)

**Author:** Denys Kubrakov <dkbeetroot@gmail.com>

## Overview

This homework configures three external MCP servers and builds one custom MCP server with
FastMCP, all registered in a single `mcp.json` in this directory:

| # | Server | Demonstrates |
|---|--------|---------------|
| 1 ⭐ | **GitHub** | Connecting Claude to a real GitHub account/repo and running a live query (PRs, commits, or issues) over the official GitHub MCP server. |
| 2 ⭐ | **Filesystem** | Scoping Claude to a real directory on this machine and reading/listing it through the Filesystem MCP server. |
| 3 ⭐⭐ | **Notion** | Connecting Claude to a real Notion workspace via OAuth and querying a live project for its most recent "bug" pages. |
| 4 ⭐⭐⭐ | **Custom FastMCP** | A self-built MCP server (`custom-mcp-server/server.py`) exposing a `lorem-ipsum.md` resource and a `read` tool, both word-count aware. |

## Resources vs Tools

- **Resources** are URIs Claude can *read from* — passive, addressable content such as files or
  API endpoints (e.g. `lorem://words`, or a GitHub repo file).
- **Tools** are *actions* Claude can *call* to perform an operation — e.g. reading a file with a
  parameter, running a command, or querying an API (e.g. the custom server's `read` tool, or the
  Filesystem server's `list_directory`).

The custom server (Task 4) exposes both over the same source file: a resource URI
(`lorem://words`, `lorem://words/{word_count}`) and a `read` tool with an optional
`word_count` parameter, so both mechanisms return the same word-limited content.

## Servers, credentials, and interactions

| Server | Transport / launch | Credential | Interaction performed | Primary screenshot |
|--------|--------------------|------------|------------------------|---------------------|
| `github` | Remote HTTP — `https://api.githubcopilot.com/mcp/` | GitHub fine-grained PAT via `GITHUB_PERSONAL_ACCESS_TOKEN` env var | Listed recent pull requests on the target repository | `docs/screenshots/github-mcp-result.png` |
| `filesystem` | Local stdio — `npx @modelcontextprotocol/server-filesystem <path>` | None (server is scoped to a single directory path) | Listed the contents of the scoped project directory | `docs/screenshots/filesystem-mcp-result.png` |
| `notion` | Remote HTTP — `https://mcp.notion.com/mcp` (OAuth) | None stored in config — authenticated interactively via `claude mcp login notion` | *"Give me the tickets/pages of the last 5 bugs on a project"* — returned 5 bug rows from the Bug Tracker page (numbers/titles only) | `docs/screenshots/jira-or-notion-mcp-result.png` |
| `lorem-ipsum` (custom) | Local stdio — this repo's `custom-mcp-server/server.py`, launched with a dedicated Python 3.12 venv | None (local process, no external account) | Called `read` tool with default `word_count` (30 words returned) | `docs/screenshots/custom-mcp-read-tool-result.png` |

**No secrets are committed.** `mcp.json` references credentials only via `${ENV_VAR}`
placeholders (currently just `${GITHUB_PERSONAL_ACCESS_TOKEN}`); the Notion server uses an
interactive OAuth login instead of a static token, so nothing sensitive is stored in the repo at
all for that server. See `HOWTORUN.md` for how to obtain and set each credential.

## Supplementary screenshots

Beyond the one primary screenshot per server above, `docs/screenshots/` also includes:

| File | Shows |
|------|-------|
| `mcp-servers-overview.png` | `/mcp` view listing all four project servers |
| `filesystem-mcp-connected.png` | `/mcp` inspector confirming `filesystem` is connected, with its tool count |
| `notion-oauth-authorized.png` | Browser confirmation after completing the Notion OAuth consent flow |
| `notion-mcp-client-connected.png` | Notion's own workspace settings showing the Claude MCP client as connected |
| `custom-mcp-connected.png` | `/mcp` inspector confirming `lorem-ipsum` is connected with 1 tool + resources |
| `custom-mcp-setup-verification.png` | Environment/setup checklist (fastmcp installed, Python 3.12 venv, server starts, config valid, all servers connected) |
| `custom-mcp-edge-case-verification.png` | Pass/fail table for edge cases: over-limit `word_count`, `0`/negative `word_count`, and both resource URIs |
| `custom-mcp-read-tool-result-wordcount10.png` | `read` tool called with `word_count=10` — returned exactly 10 words |
| `custom-mcp-resource-result.png` | The `lorem://words` **resource** (not the `read` tool) read directly — returned the same 30-word default content |

## Project layout

```
homework-5/
├── README.md
├── HOWTORUN.md
├── mcp.json / .mcp.json (symlink)
├── custom-mcp-server/
│   ├── server.py
│   ├── lorem-ipsum.md
│   └── requirements.txt
└── docs/screenshots/
```
