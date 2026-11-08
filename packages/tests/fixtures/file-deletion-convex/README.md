# Disposable local file cleanup fixture

Run `python3 run.py` only with ports 3550/3551 free. It starts a fresh loopback backend with telemetry disabled before synchronization, uses synthetic users and Convex storage, and stops the process it starts. Public fixture wrappers are not for deployment. No R2 or other provider is contacted.

The test forces a mutation rollback after storage deletion and verifies both blob and metadata remain, then checks bounded cleanup across multiple pages, missing blobs and retry, retained R2 records, shared storage IDs, another owner, stale requests, and pending-owner upload and registration denial. It does not inventory unregistered blobs or establish whole-account deletion.
