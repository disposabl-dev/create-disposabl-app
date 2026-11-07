import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";

const languages = [
  { name: "日本語", lang: "ja", size: "medium" },
  { name: "Deutsch", lang: "de", size: "medium" },
  { name: "한국어", lang: "ko", size: "small" },
  { name: "Português", lang: "pt", size: "medium" },
  { name: "English", lang: "en", size: "large" },
  { name: "العربية", lang: "ar", size: "medium" },
  { name: "Français", lang: "fr", size: "medium" },
  { name: "हिन्दी", lang: "hi", size: "large" },
  { name: "Italiano", lang: "it", size: "small" },
  { name: "中文", lang: "zh", size: "large" },
  { name: "Nederlands", lang: "nl", size: "small" },
  { name: "Türkçe", lang: "tr", size: "medium" },
  { name: "Español", lang: "es", size: "large" },
  { name: "Русский", lang: "ru", size: "medium" },
  { name: "Bahasa Indonesia", lang: "id", size: "medium" },
  { name: "اردو", lang: "ur", size: "medium" },
  { name: "తెలుగు", lang: "te", size: "small" },
  { name: "বাংলা", lang: "bn", size: "medium" },
  { name: "Tiếng Việt", lang: "vi", size: "small" },
  { name: "Polski", lang: "pl", size: "small" },
  { name: "தமிழ்", lang: "ta", size: "medium" },
  { name: "Українська", lang: "uk", size: "small" },
  { name: "עברית", lang: "he", size: "small" },
  { name: "Svenska", lang: "sv", size: "small" },
  { name: "ไทย", lang: "th", size: "medium" },
  { name: "فارسی", lang: "fa", size: "small" },
  { name: "Ελληνικά", lang: "el", size: "small" },
  { name: "Kiswahili", lang: "sw", size: "small" },
] as const;

export function LanguageCloud() {
  const cloud = useRef<HTMLUListElement>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!cloud.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.at(0)?.isIntersecting) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(cloud.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section className="language-section" aria-labelledby="language-title">
      <div className="launch-container">
        <div className="language-heading">
          <h2 id="language-title">85+ languages.</h2>
          <div className="language-status">
            <button
              onClick={(event) => event.currentTarget.focus()}
              title="Coming soon"
              aria-label="Language support is coming soon"
              aria-describedby="language-coming-soon"
            >
              <Clock3 size={26} />
            </button>
            <span role="tooltip" id="language-coming-soon">
              Coming soon.
            </span>
          </div>
        </div>
        <ul
          ref={cloud}
          data-entered={entered}
          className="language-cloud"
          aria-label="Examples of upcoming languages"
        >
          {languages.map((language) => (
            <li
              className={`language-word language-word--${language.size}`}
              key={language.lang}
              lang={language.lang}
              dir="auto"
            >
              {language.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
