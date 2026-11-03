# Delivery checks and failure recovery

Read before a first native build, a toolchain change, or a failed preview/production delivery. These are operational lessons from the meal-planner rollout, not guarantees that every platform is configured.

## Before expensive builds

- Verify GitHub and Convex connections after a browser reload. A completed OAuth screen does not prove that the callback saved a usable connection. Preserve the pending provider across redirects and inspect the account actually selected.
- Use managed setup and a worktree-scoped development token. If `bun run dev` asks to create or select a Convex project, repair setup instead of creating a personal project. Local worktree, PR preview, and production are separate deployments.
- Check the generated files, not only the generator source. Confirm the package includes `.github`, helper scripts, native packaging assets, and this skill. Check that provisioned secret names match workflow inputs without printing their values.
- Run shared delivery helpers from the working directories used by their callers. Resolve repository configuration relative to the helper module; an iOS job running in `apps/mobile` previously failed before EAS because the reporter looked for `disposabl.json` in that directory.
- Inspect the native dependency's compiler requirements and the selected runner's installed Xcode/Swift versions. Pin a compatible toolchain; do not assume the runner default is compatible or disable concurrency diagnostics to make a build pass.
- For iOS simulator builds using SecureStore, retain Xcode simulator signing (`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`). Disabling signing can omit the embedded application identifier and cause Keychain error `-34018`, leaving session initialization stuck. Inspect the executable's `__TEXT,__entitlements` section, not just `codesign` output; simulator entitlements are embedded during linking. Verify login and persistence after relaunch before accepting the archive. Simulator ad-hoc signing does not establish device signing or TestFlight readiness.
- Verify production Android signing is configured before compiling. Check Apple signing and App Store Connect readiness separately; a simulator archive does not establish TestFlight readiness. Do not infer store submission authorization from build authorization.
- Use the job-scoped GitHub token for same-repository reads. Obtain installation tokens in publishing jobs when needed. A credential accepted before a long build may fail afterward; check both stages rather than diagnosing every failed job as a compile failure.

## Avoid repeating expensive work

Diagnose independent platform failures in parallel when available, with separate owners and checkouts. Keep each device and browser session under one owner. Give a delivery delegate an observable success condition, such as an uploaded artifact or a verified login on its assigned device; a commit and local checks alone do not satisfy that condition. Batch related repairs before pushing, because PR concurrency can cancel running native builds. Use host PR watchers where applicable; do not busy poll. Hand off a new reviewed SHA before pushing subsequent changes. Keep source-commit validation when publishing so an old build cannot become the current release.

Separate an application change from a starter/pipeline defect. Repair a reusable defect in the generator and the generated app. For a new repository, establish its trusted publishing workflow on `main` before the feature preview; later workflow changes must follow the repository's review and merge policy. Do not weaken workflow-source identity checks to bypass a mismatch.

For Android, inspect the existing release's channel, application ID, runtime fingerprint, and artifact digest before rebuilding. Reuse the binary and publish an OTA update only when the existing workflow proves compatibility. Missing or incompatible artifacts require a build. Never guess compatibility from a JavaScript-only diff.

If compilation succeeds but verification or publication fails, preserve the completed artifacts when the pipeline allows it. Any recovery path must retain source, digest, signing, and publisher checks. Do not rebuild just to retry a release API call when a verified artifact is already available. Artifact recovery is a pipeline capability to check, not something every current template guarantees.

## Diagnose the failing stage

| Symptom                                                          | What to inspect first                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect remains visible after OAuth                              | Callback state, stored provider, selected GitHub installation/Convex team, persistence after reload.                                                                                                                    |
| Convex asks to create a project during managed development       | Missing app configuration or scoped development credentials. Resume managed setup.                                                                                                                                      |
| Reports fail with upstream 429                                   | Identity/token issuance frequency and retry headers. Reuse valid identities and use bounded retries; changing app features will not repair rate limiting.                                                               |
| Convex deployment fails loading modules                          | Server module initialization and dependency side effects. In the rollout, moving eager libsodium initialization into the action preceded a successful deployment; do not assume every module-load error has that cause. |
| Linux installer cannot find the executable                       | Align the packaged executable name with Debian/RPM maker `name` and `bin`. Packaging the app alone does not validate installer creation.                                                                                |
| RPM cannot copy `usr/*`                                          | Installer staging path versus rpmbuild's working directory. Use the maintained custom spec and build/inspect a real RPM.                                                                                                |
| Swift package tools version or actor-isolation compilation error | Exact Swift/Xcode version, dependency source and runner inventory. Validate the selected replacement with a real archive build.                                                                                         |
| `BUILD SUCCESSFUL`, followed by GitHub 401                       | The next API operation and its credential source. Expiration is only one possible cause; do not claim it without evidence.                                                                                              |
| An old commit's failure arrives after a fix                      | Match job ID and SHA to the already-diagnosed failure. Avoid another edit or rerun for the same stale notification.                                                                                                     |
| Repeated dependency bot comment                                  | Compare the actual findings. An informational dependency inventory is not a new security finding.                                                                                                                       |

## Evidence and timing

Record the source SHA, run/job URL, target, start/end times, failing step, and result. Parallel job durations are not additive wall time. Track queueing, compilation, upload/publication, and device verification separately when estimating delivery time.

A green compile is partial evidence. Open the deployed web page and exercise authentication and saved state. Install the preview and production Android APKs in the requested mobile lab, log in, save data, relaunch, and confirm the intended backend. Open the iOS simulator build separately; report device distribution/TestFlight independently. Only call a platform delivered when the requested behavior is visibly verified.
