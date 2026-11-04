# App builds

Install Disposabl on your personal GitHub account or an organization you administer,
then connect Convex. New GitHub users can create a free personal account first.
An organization is optional. No separate runner service is required.

Web, Android and Linux desktop builds use GitHub-hosted `ubuntu-24.04` runners.
Windows desktop uses `windows-2025`; macOS desktop and iOS simulator previews use
`macos-26` with its default Xcode. Production iOS uses EAS Build. Package
publishing and protected release jobs use GitHub-hosted Ubuntu.

Generated apps include these runner settings. Existing app repositories retain
the workflow they were created with until it is updated.
GitHub Actions and other services have usage limits; charges may apply beyond
included allowances. See [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
