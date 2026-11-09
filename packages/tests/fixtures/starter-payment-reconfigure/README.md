# Offline starter payments reconfiguration qualification

From a clean committed checkout with installed repository dependencies and a populated Bun cache:

```sh
STARTER_PAYMENT_RECONFIGURE=1 \
STARTER_QUALIFICATION_DIR=/tmp/starter-payment-reconfigure-unique \
STARTER_BUN_CACHE=/absolute/path/to/bun/install/cache \
bun test packages/tests/starter-payment-reconfigure.test.ts
```

The output directory must not exist. The test archives `HEAD`, builds its starter template with the lockfile resolution forced offline, and invokes the source `createApp` and `reconfigureApp` APIs. Each install uses `--offline --ignore-scripts`; cache misses fail. Only allowlisted environment variables reach child processes. The test retains its output, checks free space before large commands, and stops below 2 GiB. It does not run setup, a backend, a native build, or purchases. JavaScript exports do not establish runtime behavior.
