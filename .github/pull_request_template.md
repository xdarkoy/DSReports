<!-- Open PRs against the `development` branch. -->

## What & why
<!-- A short description of the change and the motivation. Link issues: Closes #123 -->

## Type
- [ ] Bug fix
- [ ] Feature
- [ ] Docs
- [ ] Refactor / chore

## Checklist
- [ ] PR targets **`development`**
- [ ] `npm run build` passes (all packages + apps)
- [ ] Type checks pass (`tsc --noEmit` for designer/ai/web)
- [ ] If I changed expression/format/binding logic, I mirrored it in **both**
      the TS evaluator (`packages/designer/src/utils`) and the Python one
      (`backend/reporting_backend/expression.py`) and kept the output identical
- [ ] Backend changes: `/render` still validates input and keeps the image/SSRF guards
- [ ] Docs updated if user‑facing ([docs/USAGE.md](../docs/USAGE.md) / package README)

## Notes for reviewers
<!-- Anything to call out: trade-offs, follow-ups, screenshots… -->
