import { useState } from "react";
import {
  Check,
  Layers3,
  Clock3,
  LayoutGrid,
  Inbox,
  Users,
  Settings,
} from "lucide-react";
import "./specialist-previews.css";

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
    <div className="special-ops operations-app">
      <aside
        className="special-ops-sidebar"
        aria-label="Example workspace navigation"
      >
        <div className="special-ops-brand">
          <span>
            <Layers3 size={19} />
          </span>
          <strong>Workroom</strong>
        </div>
        <div className="special-ops-team">NORTHSTAR STUDIO</div>
        <div className="special-ops-nav">
          <span>
            <LayoutGrid size={17} /> Overview
          </span>
          <span className="is-current">
            <Inbox size={17} /> Requests
          </span>
          <span>
            <Users size={17} /> People
          </span>
          <span>
            <Settings size={17} /> Settings
          </span>
        </div>
        <div className="special-ops-profile">
          <b>JD</b>
          <span>
            Jordan Davis<small>Workspace admin</small>
          </span>
        </div>
      </aside>
      <div className="special-ops-main">
        <div className="special-ops-top">
          <span>Workspace / Requests</span>
          <span className="special-ops-avatar">JD</span>
        </div>
        <div className="special-ops-heading">
          <div>
            <h4>Requests</h4>
            <p>Review and manage team requests.</p>
          </div>
          <div className="operations-total">
            <strong>{3 - approved.length}</strong>
            <span>to review</span>
          </div>
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
    </div>
  );
}
