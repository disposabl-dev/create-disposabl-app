import {
  createWebTelemetryAdapter,
  productTelemetrySource,
} from "../../../../apps/web/src/telemetry";
Object.assign(window, { createWebTelemetryAdapter, productTelemetrySource });
