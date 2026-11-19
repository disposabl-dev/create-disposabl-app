import { useEffect, useRef, useState } from "react";
import {
  guideJourneys,
  guideLessons,
} from "../../../../../packages/disposabl-kit/guides";
import { MarketingShell } from "./shell";
import { GuidePlayer } from "./guide-player";
import "./home.css";
import "./guide-library.css";

const publishedLessons = guideLessons.filter((lesson) => lesson.video?.uri);

export function GuideLibrary() {
  const [selected, setSelected] = useState<string | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const readLocation = () => {
      const id = new URLSearchParams(window.location.search).get("lesson");
      setSelected(
        publishedLessons.some((lesson) => lesson.id === id) ? id : null,
      );
    };
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);

  const openLesson = (id: string, button: HTMLButtonElement) => {
    returnFocus.current = button;
    const url = new URL(window.location.href);
    url.searchParams.set("lesson", id);
    window.history.pushState(null, "", url);
    setSelected(id);
  };
  const closePlayer = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("lesson");
    window.history.replaceState(null, "", url);
    setSelected(null);
  };
  useEffect(() => {
    if (!selected && returnFocus.current) {
      returnFocus.current.focus();
      returnFocus.current = null;
    }
  }, [selected]);
  return (
    <MarketingShell>
      <main id="main" className="launch-container guide-library">
        <h1>Guides</h1>
        {!publishedLessons.length && <p>Guide videos are coming soon.</p>}
        {guideJourneys.map((journey) => {
          const lessons = journey.lessonIds
            .map((id) => publishedLessons.find((lesson) => lesson.id === id))
            .filter((lesson) => lesson !== undefined);
          if (!lessons.length) return null;
          return (
            <section
              className="library-shelf"
              key={journey.id}
              aria-labelledby={`journey-${journey.id}`}
            >
              <h2 id={`journey-${journey.id}`}>{journey.title}</h2>
              <div className="library-cards">
                {lessons.map((lesson) => (
                  <button
                    className="library-card"
                    key={lesson.id}
                    type="button"
                    onClick={(event) =>
                      openLesson(lesson.id, event.currentTarget)
                    }
                  >
                    <span
                      className={`library-card-art library-art-${journey.kind}`}
                    >
                      {lesson.video?.posterUri && (
                        <img
                          src={lesson.video.posterUri}
                          alt=""
                          loading="lazy"
                        />
                      )}
                    </span>
                    <strong>{lesson.title}</strong>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </main>
      {selected && (
        <GuidePlayer
          lessons={publishedLessons}
          initialId={selected}
          onClose={closePlayer}
        />
      )}
    </MarketingShell>
  );
}
