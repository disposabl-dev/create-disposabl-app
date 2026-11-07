import { useState } from "react";
import { Check, Layers3, Clock3 } from "lucide-react";

export function OperationsDemo({ disabled }: { disabled: boolean }) {
  const [approved, setApproved] = useState<string[]>([]);
  const [filter, setFilter] = useState("Pending");
  const requests = [
    {
      id: "design",
      title: "Design software",
      team: "Product team",
      amount: "$48",
    },
    {
      id: "offsite",
      title: "Team offsite",
      team: "Operations",
      amount: "$320",
    },
    {
      id: "research",
      title: "Research tools",
      team: "Research team",
      amount: "$64",
    },
  ];
  const visible = requests.filter((r) =>
    filter === "Approved" ? approved.includes(r.id) : !approved.includes(r.id),
  );
  return (
    <div className="demo-app operations-app">
      <div className="demo-brand">
        <Layers3 size={24} />
        <strong>Workroom</strong>
      </div>
      <h4>
        Keep work
        <br />
        moving.
      </h4>
      <div className="operations-total">
        <strong>{3 - approved.length}</strong>
        <span>requests to review</span>
      </div>
      <div
        className="operations-filter"
        role="group"
        aria-label="Example request status"
      >
        {["Pending", "Approved"].map((value) => (
          <button
            key={value}
            disabled={disabled}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="operations-requests" aria-live="polite">
        {visible.length ? (
          visible.map((request) => (
            <div className="operations-request" key={request.id}>
              <div>
                <strong>{request.title}</strong>
                <span>{request.team}</span>
              </div>
              <span>{request.amount}</span>
              <button
                disabled={disabled || approved.includes(request.id)}
                aria-label={
                  approved.includes(request.id)
                    ? `${request.title} approved`
                    : `Approve ${request.title}`
                }
                onClick={() => setApproved([...approved, request.id])}
              >
                <Check size={20} />
              </button>
            </div>
          ))
        ) : (
          <div className="operations-empty">
            <Check size={30} />
            <span>
              {filter === "Pending" ? "All caught up." : "No approvals yet."}
            </span>
          </div>
        )}
      </div>
      <div className="operations-activity">
        <Clock3 size={18} />
        <span>
          {approved.length
            ? `${approved.length} approved in this demo`
            : "Ready for your review"}
        </span>
      </div>
    </div>
  );
}
