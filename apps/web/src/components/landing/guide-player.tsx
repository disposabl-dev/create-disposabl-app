import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type Hls from "hls.js";
import type { GuideLesson } from "../../../../../packages/disposabl-kit/guides";
import "./guide-player.css";

export function GuidePlayer({
  lessons,
  initialId,
  onClose,
}: {
  lessons: readonly GuideLesson[];
  initialId: string;
  onClose: () => void;
}) {
  const initial = Math.max(
    0,
    lessons.findIndex((lesson) => lesson.id === initialId),
  );
  const [active, setActive] = useState(initial);
  const activeRef = useRef(initial);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const descriptions = useRef<(HTMLButtonElement | null)[]>([]);
  const sheetClose = useRef<HTMLButtonElement>(null);
  const restoreDescription = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const current = lessons.at(active);
  const stream = current?.video?.webUri ?? current?.video?.uri;
  const failedCurrent = current ? failed.has(current.id) : false;

  const fail = useCallback((id: string) => {
    setFailed((previous) => new Set(previous).add(id));
  }, []);

  const go = useCallback(
    (index: number) => {
      const root = scroller.current;
      if (!root) return;
      const next = Math.max(0, Math.min(lessons.length - 1, index));
      root.scrollTo({ top: next * root.clientHeight, behavior: "auto" });
      activeRef.current = next;
      setActive(next);
      setPaused(false);
    },
    [lessons.length],
  );

  useEffect(() => {
    const element = dialog.current;
    const returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element?.showModal();
    go(initial);
    return () => {
      videos.current.forEach((video) => video?.pause());
      element?.close();
      returnFocus?.focus();
    };
  }, [go, initial]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const update = () => {
      const next = Math.max(
        0,
        Math.min(
          lessons.length - 1,
          Math.round(root.scrollTop / root.clientHeight),
        ),
      );
      if (activeRef.current !== next) {
        activeRef.current = next;
        setActive(next);
        setPaused(false);
        setSheetOpen(false);
      }
    };
    const resize = () => {
      root.scrollTo({
        top: activeRef.current * root.clientHeight,
        behavior: "auto",
      });
    };
    root.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      root.removeEventListener("scroll", update);
      window.removeEventListener("resize", resize);
    };
  }, [lessons.length]);

  useEffect(() => {
    const video = videos.current[active];
    if (!video || !stream || !current || failedCurrent) return;
    const id = current.id;
    let hls: Hls | undefined;
    let cancelled = false;
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    // Chromium reports native HLS support for some streams it cannot play.
    if (
      !/\.m3u8(?:\?|$)/i.test(stream) ||
      (nativeHls && "ManagedMediaSource" in window)
    ) {
      video.src = stream;
    } else {
      void import("hls.js")
        .then(({ default: HlsPlayer }) => {
          if (cancelled) return;
          if (!HlsPlayer.isSupported()) {
            if (nativeHls) video.src = stream;
            else fail(id);
            return;
          }
          const player = new HlsPlayer({
            maxBufferLength: 8,
            maxMaxBufferLength: 12,
          });
          hls = player;
          player.on(HlsPlayer.Events.ERROR, (_, error) => {
            if (error.fatal && !cancelled) fail(id);
          });
          player.loadSource(stream);
          player.attachMedia(video);
        })
        .catch(() => {
          if (!cancelled) fail(id);
        });
    }
    return () => {
      cancelled = true;
      hls?.destroy();
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [active, current, stream, failedCurrent, fail]);

  useEffect(() => {
    const selected = videos.current[active];
    const sync = () => {
      videos.current.forEach((video, index) => {
        if (!video) return;
        if (
          index === active &&
          !paused &&
          !sheetOpen &&
          document.visibilityState === "visible" &&
          document.hasFocus()
        )
          void video.play().catch((error: unknown) => {
            if (
              error instanceof DOMException &&
              error.name === "NotAllowedError" &&
              index === activeRef.current
            )
              setPaused(true);
          });
        else video.pause();
      });
    };
    sync();
    selected?.addEventListener("loadedmetadata", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    return () => {
      selected?.removeEventListener("loadedmetadata", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
    };
  }, [active, paused, sheetOpen, failed]);

  useEffect(() => {
    if (sheetOpen) sheetClose.current?.focus();
    else if (restoreDescription.current) {
      descriptions.current[active]?.focus();
      restoreDescription.current = false;
    }
  }, [sheetOpen, active]);
  const closeSheet = () => {
    restoreDescription.current = true;
    setSheetOpen(false);
  };

  return (
    <dialog
      className="guide-player"
      ref={dialog}
      aria-label="Guide player"
      onCancel={(event) => {
        event.preventDefault();
        if (sheetOpen) closeSheet();
        else close.current();
      }}
      onKeyDown={(event) => {
        if (
          !sheetOpen &&
          (event.key === "ArrowDown" || event.key === "ArrowUp")
        ) {
          event.preventDefault();
          go(active + (event.key === "ArrowDown" ? 1 : -1));
        }
      }}
    >
      <div className="reel-scroll" ref={scroller} inert={sheetOpen}>
        {lessons.map((lesson, index) => (
          <section
            className="reel"
            key={lesson.id}
            aria-label={lesson.title}
            inert={index !== active}
          >
            {lesson.video?.uri && !failed.has(lesson.id) ? (
              <>
                <video
                  ref={(element) => {
                    videos.current[index] = element;
                  }}
                  poster={lesson.video.posterUri}
                  playsInline
                  loop
                  muted={muted}
                  preload={index === active ? "metadata" : "none"}
                  onPlay={(event) => {
                    if (
                      index !== active ||
                      sheetOpen ||
                      document.visibilityState !== "visible" ||
                      !document.hasFocus()
                    )
                      event.currentTarget.pause();
                  }}
                  onError={(event) => {
                    if (
                      index === activeRef.current &&
                      event.currentTarget.error
                    )
                      fail(lesson.id);
                  }}
                >
                  {lesson.video.captionsUri && (
                    <track
                      kind="captions"
                      src={lesson.video.captionsUri}
                      srcLang="en"
                      label="English"
                    />
                  )}
                </video>
                <button
                  className="reel-play-area"
                  type="button"
                  aria-label={paused ? "Play video" : "Pause video"}
                  onClick={() => setPaused((value) => !value)}
                >
                  {paused && (
                    <Play size={32} fill="currentColor" aria-hidden="true" />
                  )}
                </button>
              </>
            ) : (
              <div
                className="reel-poster"
                role="img"
                aria-label="Video unavailable"
              >
                {lesson.video?.posterUri && (
                  <img src={lesson.video.posterUri} alt="" />
                )}
              </div>
            )}
            <div className="reel-shade" aria-hidden="true" />
            <button
              className="reel-description"
              ref={(element) => {
                descriptions.current[index] = element;
              }}
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-label={`About ${lesson.title}`}
            >
              {lesson.title}
            </button>
          </section>
        ))}
      </div>
      <div className="reel-actions" inert={sheetOpen}>
        <button type="button" onClick={onClose} aria-label="Close guide player">
          <X size={23} />
        </button>
        {current && failedCurrent && (
          <button
            type="button"
            aria-label="Retry video"
            onClick={() =>
              setFailed((previous) => {
                const next = new Set(previous);
                next.delete(current.id);
                return next;
              })
            }
          >
            <RotateCcw size={22} />
          </button>
        )}
        {stream && !failedCurrent && (
          <>
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? "Unmute video" : "Mute video"}
            >
              {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? "Play video" : "Pause video"}
            >
              {paused ? <Play size={21} /> : <Pause size={21} />}
            </button>
          </>
        )}
      </div>
      {sheetOpen && (
        <div className="reel-sheet-backdrop" onClick={closeSheet}>
          <div
            className="reel-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reel-sheet-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                event.preventDefault();
                sheetClose.current?.focus();
              }
            }}
          >
            <button
              ref={sheetClose}
              type="button"
              aria-label="Close description"
              onClick={closeSheet}
            >
              <X size={21} />
            </button>
            <h2 id="reel-sheet-title">{lessons[active]?.title}</h2>
            <p>{lessons[active]?.summary}</p>
          </div>
        </div>
      )}
    </dialog>
  );
}
