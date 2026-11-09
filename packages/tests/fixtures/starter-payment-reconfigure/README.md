# Offline starter payments reconfiguration qualification

From a clean committed checkout with installed repository dependencies and a populated Bun cache:

```sh
STARTER_PAYMENT_RECONFIGURE=1 \
STARTER_QUALIFICATION_DIR=/tmp/starter-payment-reconfigure-unique \
STARTER_BUN_CACHE=/absolute/path/to/bun/install/cache \
bun test packages/tests/starter-payment-reconfigure.test.ts
```

The output directory must not exist, and its existing parent must resolve inside the real `/tmp` tree. The test captures the exact `HEAD` SHA, archives that commit, and loads both `createApp` and `reconfigureApp` from the archive. `provenance.json` records that SHA and the archived generator version. This qualifies local source, not a published generator release.

The template build forces lockfile resolution offline. Each install uses `--offline --ignore-scripts`; cache misses fail. After installation, Expo's merged public configuration must preserve the base app fields and scheme, and its exact billing scheme and return channel must agree. Both merged configurations are retained. Only allowlisted environment variables reach child processes. The test retains its output, checks free space before large commands, and stops below 2 GiB. It does not run setup, a backend, a native build, or purchases. JavaScript exports do not establish runtime behavior.
