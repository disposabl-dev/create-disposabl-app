import { useId } from "react";

const stores = [
  { name: "Download on the App Store", image: "app-store.svg", width: 120 },
  { name: "Get it on Google Play", image: "google-play.png", width: 135 },
];

export function StoreDownloads() {
  const id = useId();
  return (
    <div className="store-buttons" aria-label="Download Disposabl">
      {stores.map((store, index) => (
        <div className="store-control" key={store.name}>
          <button
            type="button"
            className="store-button"
            aria-label={store.name}
            aria-disabled="true"
            aria-describedby={`${id}-${index}`}
            onClick={(event) => event.currentTarget.focus()}
          >
            <img
              src={`/landing/stores/${store.image}`}
              alt=""
              width={store.width}
              height={40}
            />
          </button>
          <span id={`${id}-${index}`} role="tooltip" className="store-tooltip">
            Coming soon.
          </span>
        </div>
      ))}
    </div>
  );
}
