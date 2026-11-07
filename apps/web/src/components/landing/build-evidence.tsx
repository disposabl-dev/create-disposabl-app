const run =
  "https://github.com/disposabl-dev/create-disposabl-app/actions/runs/41811672883";
const observations = [
  {
    label: "Web workflow",
    time: "1m 40s",
    job: "126559557967",
    detail: "Checks, client build, backend deployment, and web build.",
  },
  {
    label: "Android native",
    time: "29m 22s",
    job: "126559626487",
    detail: "Full job on Ubuntu 24.04. Native build step: 28m 01s.",
  },
  {
    label: "iOS simulator",
    time: "26m 39s",
    job: "126559620792",
    detail: "Full job on macOS 26. Simulator archive step: 24m 12s.",
  },
];

export function BuildEvidence() {
  return (
    <aside className="build-evidence" aria-labelledby="build-evidence-title">
      <div className="evidence-heading">
        <h3 id="build-evidence-title">Build times on November 4, 2026</h3>
      </div>
      <div className="evidence-grid">
        {observations.map(({ label, time, job, detail }) => (
          <a href={`${run}/job/${job}`} key={label} className="evidence-item">
            <span>{label} ↗</span>
            <strong>{time}</strong>
            <p>{detail}</p>
          </a>
        ))}
      </div>
      <p className="evidence-caveat">
        One Disposabl CI snapshot, not a benchmark or a time-to-finished-app
        promise. Times exclude queueing and store review. Workloads and runners
        differ. The iOS result is a simulator build, not a signed device
        release.
      </p>
    </aside>
  );
}
