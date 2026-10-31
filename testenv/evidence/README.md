# Fixed evidence samples

Files under `evidence/` are **tracked, read-only samples** from the F05 MOCK delivery.

Live test output is written to `../runs/<timestamp>-<sha>/` (gitignored), including `manifest.json`.

Do not overwrite these samples from test runners. `loop/check-evidence-clean.cjs` fails the job if any tracked file here changes after a run.
