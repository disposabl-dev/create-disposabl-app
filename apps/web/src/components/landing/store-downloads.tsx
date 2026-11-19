export function StoreDownloads() {
  return (
    <div className="store-buttons" aria-label="Download Disposabl">
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
      <a
        className="store-button"
        href="https://play.google.com/store/apps/details?id=com.yastai.disposabl"
        aria-label="Get it on Google Play"
      >
        <img
          src="/landing/stores/google-play.png"
          alt=""
          width={135}
          height={40}
        />
      </a>
    </div>
  );
}
