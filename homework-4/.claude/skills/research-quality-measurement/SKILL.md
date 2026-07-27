---
name: research-quality-measurement
description: How to measure and label the quality of a codebase-research document and how to structure verified-research.md. Use when verifying a Bug Researcher's findings — every file:line reference and quoted snippet is checked against source, scored, and assigned a named quality level.
---

# Research Quality Measurement

A reusable rubric for a **verifier** to grade a `codebase-research.md` document and write a
`verified-research.md` result. The goal is a consistent, reproducible rating — the same research
gets the same level regardless of who (or which run) verifies it.

A **claim** is any statement in the research that asserts something checkable about the source —
almost always a `file:line` reference paired with a quoted snippet ("In `src/store.js:18`,
`const id = notes.length + 1;`"). Each claim is either **verified** or a **discrepancy**.

---

## 1. Quality scale

Assign exactly one level, using the objective criteria below.

| Level | Criteria |
|-------|----------|
| **VERIFIED** | 100% of claims verified — every `file:line` reference resolves to real code **and** every quoted snippet matches the current source exactly (whitespace-insensitive). No fabricated references. |
| **MOSTLY-VERIFIED** | ≥ 80% of claims verified. Remaining issues are **minor/cosmetic only** — e.g. a line number off by ≤ 2, a trimmed but semantically identical snippet. No fabricated references, no wrong file. |
| **PARTIAL** | 50–80% of claims verified, **or** any claim points at the wrong file / a materially different snippet (not just cosmetic). Some claims cannot be confirmed from the source. |
| **UNRELIABLE** | < 50% of claims verified, **or** any **fabricated reference** exists (a `file:line` that does not exist, or a snippet not present anywhere in the cited file). |

**Pass/fail:** `VERIFIED` and `MOSTLY-VERIFIED` **pass** (downstream agents may consume the
research). `PARTIAL` passes **with caution** — the planner must re-check flagged claims.
`UNRELIABLE` **fails** — the research must be redone before planning.

---

## 2. Scoring procedure

1. **Enumerate claims.** List every checkable claim in the research. `total_claims` = that count.
2. **Verify each claim** against the current source:
   - **Reference resolves?** Open the cited file; does the line exist?
   - **Snippet matches?** Compare the quoted snippet to the actual line(s), ignoring leading/
     trailing whitespace. Exact (or whitespace-only difference) → match.
   - A claim is **verified** only if the reference resolves **and** the snippet matches.
3. **Compute the ratio:** `score = verified_claims / total_claims`.
4. **Classify discrepancies** (each downgrades, per §1):
   - **Dead reference** — `file:line` doesn't exist → counts against the ratio; if the snippet
     also appears nowhere in the file, it is a **fabricated reference**.
   - **Snippet mismatch (cosmetic)** — same line, whitespace/trivial difference → still counts as
     *verified* for the ratio but note it; many cosmetic drifts cap the level at MOSTLY-VERIFIED.
   - **Snippet mismatch (material)** — different code or wrong file → **not verified**; caps the
     level at **PARTIAL** at best.
5. **Apply caps (a cap overrides the raw ratio):**
   - **Any fabricated reference → UNRELIABLE**, regardless of ratio.
   - **Any material mismatch / wrong file → PARTIAL** (or lower if the ratio is worse).
   - Otherwise map the ratio to the scale: `1.0` → VERIFIED, `≥0.8` → MOSTLY-VERIFIED,
     `0.5–0.8` → PARTIAL, `<0.5` → UNRELIABLE.

The **cap** always wins over the ratio: a document can be 95% verified and still be `UNRELIABLE`
if a single reference was fabricated. Fabrication is the cardinal sin for a research doc.

---

## 3. Required structure of `verified-research.md`

The verifier MUST write these sections, in this order:

1. **Verification Summary** — one line: `PASS` / `PASS (caution)` / `FAIL`, the **Research
   Quality** level, and the `verified_claims / total_claims` ratio.
2. **Verified Claims** — a table of every claim that checked out:
   `# | claim | file:line | snippet matches? (✓)`.
3. **Discrepancies Found** — every failed/flagged claim with **expected vs actual**
   (what the research said vs what the source actually contains) and the discrepancy type
   (dead reference / fabricated / cosmetic mismatch / material mismatch). "None" if clean.
4. **Research Quality Assessment** — the assigned **level + reasoning**: the ratio, which caps
   (if any) were triggered, and why this level and not the adjacent ones.
5. **References** — the files inspected during verification (with the lines checked), so the
   assessment is auditable.

---

## 4. Worked example

Research doc makes 5 claims. On verification:

- 4 references resolve with matching snippets → verified.
- 1 claim cites `src/store.js:42` but the file has 40 lines → **dead reference**, and the quoted
  snippet appears nowhere in `store.js` → **fabricated**.

`score = 4/5 = 0.80`. Raw ratio would suggest MOSTLY-VERIFIED — **but** the fabricated reference
triggers the cap → final level **UNRELIABLE**, `FAIL`. The Discrepancies section records:

> **Claim 5 — FABRICATED.** Research said `src/store.js:42 → "return cache.get(id)"`. Actual:
> `src/store.js` ends at line 40; no `cache.get` exists in the file. Expected the reference to
> resolve; it does not.

Assessment: *"UNRELIABLE — 4/5 claims verified (0.80), but claim 5 is a fabricated reference,
which caps the level at UNRELIABLE regardless of ratio. Research must be redone before planning."*
