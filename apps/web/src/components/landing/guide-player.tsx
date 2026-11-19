import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type Hls from "hls.js";
import type { GuideLesson } from "../../../../../packages/disposabl-kit/guides";
import { GuideSocial } from "./guide-social";
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
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
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
      setDescriptionOpen(false);
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
        setDescriptionOpen(false);
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
    if (!current) return;
    const url = new URL(window.location.href);
    url.searchParams.set("lesson", current.id);
    window.history.replaceState(null, "", url);
  }, [current]);

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
  }, [active, paused, failed]);

  return (
    <dialog
      className="guide-player"
      ref={dialog}
      aria-label="Guide player"
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          go(active + (event.key === "ArrowDown" ? 1 : -1));
        }
      }}
    >
      <div className="reel-scroll" ref={scroller}>
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
            <div className="reel-description">
              <strong>@disposabl</strong>
              <button
                type="button"
                onClick={() => setDescriptionOpen((value) => !value)}
                aria-expanded={descriptionOpen}
                aria-label={`About ${lesson.title}`}
              >
                <span>{lesson.title}</span>
                <span
                  className={
                    descriptionOpen ? "reel-summary expanded" : "reel-summary"
                  }
                >
                  {lesson.summary}
                </span>
                <span className="reel-more">
                  {descriptionOpen ? "Less" : "More"}
                </span>
              </button>
            </div>
          </section>
        ))}
      </div>
      <div className="reel-actions">
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
      {current && (
        <GuideSocial
          key={current.id}
          lessonId={current.id}
          onShare={() => setPaused(true)}
        />
      )}
    </dialog>
  );
}
