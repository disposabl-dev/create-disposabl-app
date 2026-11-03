# App builds

Install Disposabl and Blacksmith in the same GitHub organization before creating
an app. Blacksmith does not support personal repositories. A GitHub organization
is free and works for a solo developer: [create one](https://github.com/organizations/plan).
Select All repositories when installing Blacksmith so newly generated apps can
run their workflows. A confirmation in Disposabl records the user's setup;
only a completed runner job proves that repository access works.

Web and Android builds use Blacksmith Ubuntu runners. Desktop builds use its
Linux, Windows, or macOS runners; iOS simulator previews use its macOS 27 image
and default Xcode. The existing production iOS path uses EAS Build. Package
publishing and protected release jobs remain on GitHub-hosted Ubuntu for their
trusted publishing configuration.

Blacksmith includes 3,000 equivalent 2-vCPU Linux minutes per organization per
month. Larger runners and Windows/macOS consume the allowance at different
rates. See [pricing](https://www.blacksmith.sh/pricing) and
[runner types](https://docs.blacksmith.sh/blacksmith-runners/overview).
All provider accounts are free to create; build and hosting usage limits apply.
