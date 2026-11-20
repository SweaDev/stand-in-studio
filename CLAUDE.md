# CLAUDE.md

This repo is built task by task from a plan.

- **Start here:** open [TASKS.md](TASKS.md), follow its *Resume protocol*, and do the first unchecked task.
- **Rules:** the *Ground rules* in [PLAN.md](PLAN.md) are binding. In short:
  - commit as `Fayaz Ahmed <me@fayaz.dev>` with a single-line message and no trailers;
  - one task per commit, and every commit must build and pass `npm test`;
  - push directly to `main`, and tag at each phase end;
  - keep Presage SDK live usage under 900 s in total, through `scripts/presage-budget.mjs`.
- **Spec:** [REQUIREMENT.md](REQUIREMENT.md) is the product spec. SDK facts measured live are in `docs/sdk-notes.md`.
- **Reproducibility:** log test-clip provenance, live-run seconds, perf numbers and plan deviations in [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md).
