# Planners Form 0.1.2

Fixes `failed to import` after installing the GitHub repository URL.

The 0.1.1 Git source archive declared bundled dependencies but did not contain them. DSH/pnpm therefore skipped installation of tar and Review Dock. A relative file dependency is also unsuitable for resolving Review Dock from a consumer profile.

The Git source now includes the exact production dependency files and their licenses, matching the bundled release package. No prepare hook or build approval is needed. The source archive import regression test fails on 0.1.1 and passes with these files included.

The tar dependency is updated to 7.5.22; npm audit reports no known vulnerabilities for this dependency tree at verification time.

Installation address: https://github.com/thePlannerIvan/planners-form

The `/releases/tag/...` page is not an installation address. Release installation uses the direct `.tgz` asset URL.
