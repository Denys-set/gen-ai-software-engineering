"""Custom FastMCP server exposing lorem-ipsum.md.

Resources are URIs Claude can read from (here: lorem://words[/{word_count}]) — passive,
addressable content. Tools are actions Claude can call to perform an operation (here: the
`read` tool), typically chosen based on the tool's docstring rather than fetched by URI.
"""

from pathlib import Path

from fastmcp import FastMCP

mcp = FastMCP("lorem-ipsum")

LOREM_PATH = Path(__file__).resolve().parent / "lorem-ipsum.md"

DEFAULT_WORD_COUNT = 30


def _read_words(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Return the first `word_count` whitespace-split words from lorem-ipsum.md."""
    text = LOREM_PATH.read_text(encoding="utf-8")
    words = text.split()
    if word_count <= 0:
        return ""
    return " ".join(words[:word_count])


@mcp.resource("lorem://words")
def lorem_words_default() -> str:
    """The first 30 words of lorem-ipsum.md."""
    return _read_words(DEFAULT_WORD_COUNT)


@mcp.resource("lorem://words/{word_count}")
def lorem_words(word_count: int) -> str:
    """The first `word_count` words of lorem-ipsum.md."""
    return _read_words(word_count)


@mcp.tool
def read(word_count: int = DEFAULT_WORD_COUNT) -> str:
    """Read the first `word_count` words (default 30) from the server's lorem-ipsum.md file.

    Use this whenever the user asks for lorem ipsum / placeholder text, or asks to "read"
    the sample text with an optional specific word count.
    """
    return _read_words(word_count)


if __name__ == "__main__":
    mcp.run()
