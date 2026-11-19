# Preview storage and cleanup

Use one worktree per active draft and reuse it for follow-up edits. Run web and native builds on the hosted preview runners when publishing a preview. For local verification, build only the requested targets and keep generated outputs inside the draft worktree. If you set a custom Xcode Derived Data path, put it inside that worktree. Use the shared package download caches and SDK installations already on the machine.

After verification, retain any APK, simulator archive, or log the user needs. Stop only the development servers and builds you started for that draft. For a draft still under review, use the following from its worktree when you need to recover space. Review the dry run first and use the same paths for the deletion command.

```sh
git clean -nXd -- node_modules .turbo apps/web/dist apps/mobile/dist apps/mobile/.expo \
  apps/mobile/android/.gradle apps/mobile/android/build apps/mobile/android/app/build \
  apps/mobile/ios/build apps/mobile/ios/Pods
git clean -fXd -- node_modules .turbo apps/web/dist apps/mobile/dist apps/mobile/.expo \
  apps/mobile/android/.gradle apps/mobile/android/build apps/mobile/android/app/build \
  apps/mobile/ios/build apps/mobile/ios/Pods
```

Once GitHub confirms publication by merging the draft PR to `main`, close the draft's worktree session and run the cleanup from the primary checkout. Use the host's removal command for a host-managed workspace and this command for a worktree created with Git.

```sh
bun .agents/skills/disposabl-app/scripts/cleanup-preview.mjs /absolute/path/to/draft 123
```

In the Disposabl source repository, the script is at `packages/skill/scripts/cleanup-preview.mjs`.

The script checks that the linked worktree matches the merged, same-repository PR's head commit. Git removes the worktree and its ignored files and rejects worktrees that are locked or contain local changes. If cleanup is blocked, report the worktree path and Git's reason. Keep build evidence that exists only in the worktree before running cleanup. Repeat this step when resuming a draft that was published in GitHub outside the agent workflow.
