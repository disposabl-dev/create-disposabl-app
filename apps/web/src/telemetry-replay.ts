import type { SessionRecordingOptions } from "posthog-js";

/** Replay masks all text, inputs and attributes and blocks media and private pages. */
export function replayOptions(): SessionRecordingOptions {
  return {
    maskAllInputs: true,
    maskTextSelector: "*",
    maskAllElementAttributes: true,
    blockSelector:
      'head,style,link,img,svg,canvas,iframe,video,audio,object,embed,input[type="file"],[data-sensitive],[data-private],body:not([data-replay-public="true"])',
    captureJsonLd: false,
    recordHeaders: false,
    recordBody: false,
    captureCanvas: { recordCanvas: false },
    maskCapturedNetworkRequestFn: () => ({
      name: "https://www.disposabl.dev/",
      entryType: "",
      duration: 0,
      startTime: 0,
    }),
  };
}

export function publicReplayPath(path: string) {
  return (
    path === "/" ||
    path === "/why-disposabl" ||
    path === "/build" ||
    path === "/stack"
  );
}

export function replayProperties(
  properties: Record<string, unknown>,
  projectToken: string,
  distinctId: string,
) {
  const data = properties.$snapshot_data;
  const session = properties.$session_id;
  const windowId = properties.$window_id;
  const bytes = properties.$snapshot_bytes;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !Array.isArray(data) ||
    typeof session !== "string" ||
    !uuid.test(session) ||
    typeof windowId !== "string" ||
    !uuid.test(windowId) ||
    typeof bytes !== "number" ||
    !Number.isFinite(bytes) ||
    bytes < 0
  )
    return null;
  return {
    token: projectToken,
    distinct_id: distinctId,
    $snapshot_data: data,
    $snapshot_bytes: bytes,
    $session_id: session,
    $window_id: windowId,
  };
}
