import {
  replayOptions,
  publicReplayPath,
  replayProperties,
} from "../../../../apps/web/src/telemetry-replay";
import { PostHog } from "posthog-js/full/no-external";
import { safeTelemetryEvent } from "../../../../apps/web/src/telemetry-policy";
Object.assign(window, {
  replayOptions,
  publicReplayPath,
  replayProperties,
  safeTelemetryEvent,
  TestPostHog: PostHog,
});
