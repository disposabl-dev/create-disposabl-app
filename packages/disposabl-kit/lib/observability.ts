const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

export function parseTraceparent(value: string | null | undefined) {
  const [, traceId, parentSpanId] = traceparentPattern.exec(value ?? "") ?? [];
  if (
    !traceId ||
    !parentSpanId ||
    /^0+$/.test(traceId) ||
    /^0+$/.test(parentSpanId)
  )
    return null;
  return { traceId, parentSpanId };
}

export function startSpan(parent?: string) {
  const context = parseTraceparent(parent);
  const traceId = context?.traceId ?? crypto.randomUUID().replaceAll("-", "");
  const spanId = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return {
    traceId,
    spanId,
    parentSpanId: context?.parentSpanId,
    traceparent: `00-${traceId}-${spanId}-01`,
  };
}

type Operation = {
  service: "disposabl-cli" | "disposabl-api" | "disposabl-mcp";
  name: string;
  source: string;
  startedAt: number;
  endedAt: number;
  failed: boolean;
  distinctId?: string;
  span: ReturnType<typeof startSpan>;
};

const attribute = (key: string, stringValue: string) => ({
  key,
  value: { stringValue },
});
const nanoseconds = (ms: number) => String(BigInt(Math.round(ms)) * 1_000_000n);

// Callers enforce the release/environment and opt-out gates before exporting.
export async function exportOperation(
  config: { host: string; token: string },
  operation: Operation,
  timeout: number,
) {
  const {
    service,
    name,
    source,
    startedAt,
    endedAt,
    failed,
    distinctId,
    span,
  } = operation;
  const resource = {
    attributes: [
      attribute("service.name", service),
      attribute("deployment.environment.name", "production"),
    ],
  };
  const attributes = [
    attribute("disposabl.source", source),
    attribute("disposabl.operation", name),
  ];
  const context = { traceId: span.traceId, spanId: span.spanId, attributes };
  const send = (signal: "traces" | "logs", data: unknown) =>
    fetch(`${config.host}/i/v1/${signal}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  const endTime = nanoseconds(Math.max(startedAt, endedAt));
  const pending = [
    send("traces", {
      resourceSpans: [
        {
          resource,
          scopeSpans: [
            {
              spans: [
                {
                  ...context,
                  attributes: distinctId
                    ? [
                        ...attributes,
                        attribute("posthog.distinct_id", distinctId),
                      ]
                    : attributes,
                  ...(span.parentSpanId
                    ? { parentSpanId: span.parentSpanId }
                    : {}),
                  name,
                  kind: service === "disposabl-cli" ? 3 : 2,
                  startTimeUnixNano: nanoseconds(startedAt),
                  endTimeUnixNano: endTime,
                  status: { code: failed ? 2 : 1 },
                },
              ],
            },
          ],
        },
      ],
    }),
  ];
  if (failed)
    pending.push(
      send("logs", {
        resourceLogs: [
          {
            resource,
            scopeLogs: [
              {
                logRecords: [
                  {
                    ...context,
                    attributes: distinctId
                      ? [
                          ...attributes,
                          attribute("posthogDistinctId", distinctId),
                        ]
                      : attributes,
                    timeUnixNano: endTime,
                    severityNumber: 17,
                    severityText: "ERROR",
                    body: { stringValue: "Disposabl operation failed" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  await Promise.allSettled(pending);
}
