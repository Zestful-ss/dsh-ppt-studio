# Compatibility record

Checked: 2026-10-13

## Release target: DSH 0.2.0-rc.2

The runtime was extracted from the installed official DeepSeek Harness desktop application's `app.asar` into an isolated temporary directory. Both its CLI and desktop-runtime package identify themselves as 0.2.0-rc.2. The server ran using the application's bundled Node, which reported 24.21.0.

The actual Planners Form `.tgz` was installed with this runtime's `dsh plugin --profile web add <tgz> --offline` into a new DSH_HOME. The CLI completed successfully and added the bundle automatically.

Live results:

| Check | Result |
|---|---|
| Official plugin compatibility evaluator | Accepted 0.2.0-rc.2 |
| Settings section | Planners Form appeared and rendered |
| Business name + invocation name | Both visible |
| Authenticated settings status | HTTP 200 |
| Same-origin repair action | HTTP 202, job completed |
| Review Bridge | HTTP 200, ReviewBridge code returned |
| Unknown route control | HTTP 404 |

The live test reused an existing review-core through a link inside the isolated DSH_HOME. This tests plugin/runtime integration; it does not prove GitHub download success on a clean machine. No model API key or paid model request was used, so generated-content feedback/wake end-to-end is not a claimed result.

## Alpha releases

Official tags checked: `dsh-v0.2.1-alpha.1`, `dsh-v0.2.1-alpha.2`.

The settings contract file `packages/client/ui-settings/src/client/contract/slots.ts` has the identical Git blob SHA `d04ac21fa606fe4dc0af75dee0bae4b60fb299a7` in rc.2 and both alphas. This establishes only that specific interface's stability, not whole-runtime compatibility.

No alpha binary was executed. The release manifest deliberately declares exactly `0.2.0-rc.2`; DSH's own compatibility evaluator refuses both alpha versions without an explicit version exemption. Do not advertise alpha support based on this source check.

## Additional checks and limits

26 automated tests cover the install/update manager, archive extraction, external installation preservation, dependency closure, recovery after interruption, and authenticated HTTP handling. Earlier UI development also ran on DSH 0.1.7-rc.1; that version is not in this release's supported range.

Initial direct GitHub/npm connections failed with TLS errors. The subsequent 0.1.1 verification successfully accessed all five newly public repositories without authentication and installed the actual proposal, bypage and video dependency closure in an empty DSH_HOME (11 Skills). Companion Skill mounts and frontmatter identifiers were checked. The plugin archive bundles its Node dependencies. PPT Python/browser provisioning, Video Craft rendering tools, native desktop plugin-manager installation, and Windows still require separate validation.

The 0.1.1 catalog pins the five newly public repositories to audited commits. Settings hides `sparkling`, `storytelling` and `slide-copy` in both lists, while dependency installation and updates still include them.

## 0.1.2 Git installation fix

0.1.1 Release-package checks did not cover Git source installation. The source archive lacked dependencies marked as bundled, causing entry import failure. 0.1.2 includes the production dependencies and adds a Git archive import test without inherited developer dependencies.
