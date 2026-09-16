# Phase delivery and Git workflow

## Start each phase

Read the relevant issue (if assigned), docs/ROADMAP.md, applicable product/design notes and existing packages/contracts schemas. Record dependencies and acceptance criteria. No GitHub issue has been assigned yet; do not invent one.

Work only in the cloned `repository/` checkout inside the SuRaksha workspace. Its confirmed origin is https://github.com/FuzailAhmad-Sphericaljudge/SuRaksha.git and its initial branch is main. The parent Desktop repository points to an unrelated FAULTLINE remote and must not receive these changes.

## End each phase

1. Complete the phase's meaningful deliverable and acceptance checks.
2. Review changes and staged files; exclude private media, credentials, tools and unrelated files.
3. Run npm run verify once Phase 02 provides it, plus git diff --check and git diff --cached --check. Phase 01 is documentation-only; verify is not available and must not be reported as passing.
4. Update the roadmap with completed scope, actual checks and remaining limitations.
5. Commit meaningful changes with a phase-specific message, using the configured author without fabricating identity or dates.
6. Push the completed phase to the confirmed remote/branch. If protected, use a phase branch and review flow; never force push or bypass protection. Push permission is already provided by the user.
7. Record/report commit hash and actual push outcome. A pending or failed push is not completion of remote delivery. Do not proceed through multiple phase completions while silently skipping requested pushes.

Use real implementation-sized phases. Do not create empty commits, artificially split trivial edits, or backdate commits to inflate activity. Pushes alone do not guarantee contribution-calendar credit; follow GitHub's current eligibility rules when configuring the destination/author.

Application verification should include typecheck, relevant tests and build. Test contracts, authorization boundaries, timestamps, failure/retry, duplicate and no-op behavior as these become implemented. Use user-visible workflow checks for uploads, owner claims, private sharing and inspection closure. Never substitute tests of implementation details for actual behavior.

Deploy/release is a separate milestone. A Git push does not automatically mean a public production release.
