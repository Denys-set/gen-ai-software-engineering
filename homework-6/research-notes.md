# Research Notes — context7 queries (Agent 2 code generation)

> Two context7 MCP lookups made while building the pipeline. Each records the search, the
> real Context7-compatible library ID returned, and the concrete pattern applied in the code.
> context7 server: Context7 v4.0.0 (`resolve-library-id` → `query-docs`). Author: Denys Kubrakov.

## Query 1: decimal / monetary arithmetic (Python)
- **Search:** "Python decimal module rounding / quantize" (resolve-library-id query
  `"cpython"` and `"python standard library decimal"`)
- **context7 library ID:** `/python/cpython` (also `/websites/python_3_13_library` for the
  stdlib `decimal` page) — resolved live from the context7 MCP server.
- **What came back:** the `Decimal.quantize(exp, rounding=...)` API and the stdlib
  `moneyfmt()` recipe, sourced from
  `https://docs.python.org/3/library/decimal.html` /
  `github.com/python/cpython/blob/main/Doc/library/decimal.md`. Key snippet:
  ```pycon
  >>> TWOPLACES = Decimal(10) ** -2          # == Decimal('0.01')
  >>> Decimal('3.214').quantize(TWOPLACES)   # -> Decimal('3.21')
  >>> Decimal('7.325').quantize(Decimal('.01'), rounding=ROUND_DOWN)
  Decimal('7.32')
  ```
- **Applied:** parse money as `Decimal(str(amount))` (never `float`), then normalise with
  `amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` for consistent 2-place banking
  rounding across the validator, fraud detector, and compliance/settlement math. The
  quantize-with-`Inexact`-trap idiom is noted as a way to *validate* that an input has no more
  than 2 decimal places.

## Query 2: FastMCP server (tools + resource, stdio) for the custom MCP server
- **Search:** "FastMCP Python server tools and resources" (resolve-library-id `libraryName`
  = "FastMCP")
- **context7 library ID:** `/prefecthq/fastmcp` (benchmark 87.58, High reputation, 4041
  snippets; versions v3.2.0 / v3.2.4). Alternates returned: `/websites/gofastmcp`,
  `/llmstxt/gofastmcp_llms_txt`.
- **What came back:** the canonical stdio server shape, sourced from
  `github.com/prefecthq/fastmcp/blob/main/docs/...`:
  ```python
  from fastmcp import FastMCP
  mcp = FastMCP("MyServer")

  @mcp.tool
  def my_tool(x: int) -> str:      # tools are plain typed functions; schema is auto-generated
      return str(x)

  @mcp.resource("data://info")     # resources are addressed by a URI
  def my_resource() -> str:
      return "info"

  if __name__ == "__main__":
      mcp.run()                    # STDIO transport by default; guard for subprocess launch
  ```
- **Applied:** in `mcp/server.py` (Task 4) use bare `@mcp.tool` decorators (v3 style, **not**
  `@mcp.tool()`) for `get_transaction_status(transaction_id: str)` and
  `list_pipeline_results()`, and `@mcp.resource("pipeline://summary")` for the run-summary
  resource, then launch with `mcp.run()` under an `if __name__ == "__main__"` guard so Claude
  Code can start it as a stdio subprocess (matching the `mcp.json` `pipeline-status` block).
