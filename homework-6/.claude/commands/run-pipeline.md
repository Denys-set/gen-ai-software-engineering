---
description: Run the multi-agent banking pipeline end-to-end and summarize the results (approved/rejected + reasons).
---

# /run-pipeline — run the banking pipeline end-to-end

Run the full multi-agent banking pipeline and report what happened. Work from the `homework-6/`
project root. Use **`python3.12`** (the repo's FastMCP-compatible interpreter; `python3` is 3.9).

Steps:

1. **Check input exists.** Confirm `sample-transactions.json` is present. If it is missing, stop
   and report the error — do not run the pipeline.

2. **Clear shared/ state.** The integrator resets `shared/input,processing,output,results` and the
   audit log at the start of every run (`_reset_shared()`), so a normal run is already clean. If
   you want a hard reset first, remove stale artifacts:
   ```bash
   rm -f shared/input/*.json shared/processing/*.json shared/output/*.json \
         shared/results/*.json shared/results/audit.log
   ```

3. **Run the pipeline.**
   ```bash
   python3.12 integrator.py
   ```

4. **Show the results summary.** Print the pipeline summary (counts + cross-border breakdown) and
   the contents of `shared/results/summary.json`:
   ```bash
   cat shared/results/summary.json
   ```

5. **Report rejected transactions and why.** List every transaction whose final `status` is
   `rejected`, with its `reason` (PII stays masked — ids and reasons only):
   ```bash
   python3.12 - <<'PY'
   import json, glob
   for f in sorted(glob.glob("shared/results/TXN*.json")):
       d = json.load(open(f))["data"]
       if d.get("status") == "rejected":
           print(f"{d['transaction_id']}: rejected — {d.get('reason')}")
   PY
   ```

Finish with a one-line verdict, e.g. "8 processed → 6 approved, 2 rejected (TXN006 bad currency,
TXN007 non-positive amount)."
