import { useId } from "react";

export function StoreDownloads() {
  const id = useId();
  return (
    <div className="store-buttons" aria-label="Download Disposabl">
      <div className="store-control">
        <a
          className="store-button"
          href="https://apps.apple.com/app/disposabl-build-apps-agents/id6805446871"
          aria-label="Download on the App Store"
        >
          <img
            src="/landing/stores/app-store.svg"
            alt=""
            width={120}
            height={40}
          />
        </a>
      </div>
      <div className="store-control">
        <button
          type="button"
          className="store-button"
          aria-label="Get it on Google Play"
          aria-disabled="true"
          aria-describedby={id}
          onClick={(event) => event.currentTarget.focus()}
        >
          <img
            src="/landing/stores/google-play.png"
            alt=""
            width={135}
            height={40}
          />
        </button>
        <span id={id} className="store-tooltip">
          Coming soon.
        </span>
      </div>
    </div>
  );
}
