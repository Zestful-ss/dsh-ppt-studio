# Planners Form 0.1.4

Restores the plugin on DSH 0.2.1.

0.1.3 pinned the runtime as an exact peer (`"@deepseek-ai/dsh": "0.2.0-rc.2"`). DSH's compatibility gate treats an unmet `engines.dsh`/peer range as a reason to skip the whole bundle at profile load, and the desktop app prints nothing when that happens — so upgrading to 0.2.1-rc.1 silently removed the Settings section while the profile still listed the plugin.

The release now declares the supported line instead of one build: `peerDependencies["@deepseek-ai/dsh"] = "^0.2.0-rc.2"` and `engines.dsh = "^0.2.0-rc.2"`. DSH 0.2.1 prefers `engines.dsh`; older evaluators use the peer range. 0.2.0-rc.2 and 0.2.1-rc.1 are both accepted; 0.3.0 still is not.

No plugin code changed. The 0.1.3 skill-discovery work (DSH skill registry, immediate catalog invalidation, installed-row indicators) is unchanged. The bundled Review Dock moves to 0.2.4, which fixes a false "escaped project_root" 403 for surfaces opened through a symlinked path and refreshes the vendored design tokens for 0.2.1.

Verification: 33 plugin tests pass, including the Git-source archive import test; the package installs on the 0.2.1-rc.1 runtime, the bundle is no longer skipped, the Settings API answers 200 with `reviewReady: true`, the client bundle is served, and every review route behaves as before. Details are recorded in COMPATIBILITY.md.

Installation address: https://github.com/thePlannerIvan/planners-form
