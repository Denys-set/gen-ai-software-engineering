# How to Run — Homework 5

All commands assume you `cd` into `homework-5/` first.

## 1. Install dependencies (custom server)

```fish
cd custom-mcp-server
python3.12 -m venv .venv        # fastmcp requires Python >= 3.10; system python3 may be older
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
.venv/bin/pip show fastmcp      # verify fastmcp is installed
```

## 2. Run the custom server directly (smoke test)

```fish
.venv/bin/python server.py
```

Expected output: a FastMCP startup banner ending with

```
Starting MCP server 'lorem-ipsum' with transport 'stdio'
```

The process waits on stdio for JSON-RPC input — press `Ctrl-C` to stop. It is not meant to be
run standalone in normal use; the MCP client (below) launches it automatically.

## 3. Connect the MCP configuration

`mcp.json` (with `.mcp.json` as a symlink to it, so Claude Code auto-discovers it as project
config) registers all four servers:

| Server | Needs before first use |
|--------|--------------------------|
| `github` | `GITHUB_PERSONAL_ACCESS_TOKEN` set in your shell environment |
| `filesystem` | Nothing — path is baked into `mcp.json` |
| `notion` | Interactive OAuth login (see below) |
| `lorem-ipsum` | Steps 1–2 above completed (the venv must exist) |

### Setting `GITHUB_PERSONAL_ACCESS_TOKEN`

Create a fine-grained PAT at **github.com/settings/tokens** → *Fine-grained tokens* → scope it to
this repo with **Contents: Read**, **Pull requests: Read**, **Issues: Read/Write**, **Metadata:
Read** (auto-included). Then export it so every shell sees it, e.g. for zsh:

```fish
echo 'export GITHUB_PERSONAL_ACCESS_TOKEN=<your-token>' >> ~/.zshenv
```

(or the fish equivalent: `set -Ux GITHUB_PERSONAL_ACCESS_TOKEN <your-token>`). Open a new shell
afterward so the variable is picked up.

### Authenticating Notion

The Notion server uses OAuth, not a static token — no env var needed. From an interactive
terminal (not a non-interactive/embedded session — the browser callback needs a real TTY):

```fish
claude mcp login notion
```

This opens a browser to Notion's sign-in. Log in (or sign up for free), then approve the consent
screen. Afterward, open the target Notion page → **`•••`** menu → **Connections** → add the
Claude/MCP integration, so the server can actually see that page (OAuth alone does not share
pages automatically).

### Verifying registration

```fish
claude mcp list
```

All four servers should show `✔ Connected` (a server shown as `⏸ Pending approval` just needs
one interactive `claude` session where you accept the project's trust prompt; run
`claude mcp reset-project-choices` if a stale approval state is stuck).

## 4. Use / test the custom `read` tool

Inside an interactive `claude` session started from `homework-5/`:

```
Call the read tool from the lorem-ipsum MCP server with no arguments. Show me the exact tool
call and its response, and count the words returned.
```
Expected: exactly **30 words**.

```
Call the read tool from the lorem-ipsum MCP server with word_count set to 10. Show me the exact
tool call and its response, and count the words returned.
```
Expected: exactly **10 words**.

```
Read the lorem://words resource from the lorem-ipsum MCP server. Show me the content and count
the words.
```
Expected: the same 30-word default content, confirming the resource path works independently of
the tool.

## Credential summary (one line each)

- **GitHub** — Personal Access Token from github.com/settings/tokens (fine-grained, scoped to
  this repo), set as `GITHUB_PERSONAL_ACCESS_TOKEN`.
- **Filesystem** — no credential; access is limited to the absolute path given in `mcp.json`.
- **Notion** — no token to create; sign in/up via the OAuth flow triggered by
  `claude mcp login notion`, then share the target page with the integration.
- **Custom (lorem-ipsum)** — no credential; local stdio process launched from a project-local
  Python 3.12 venv.
