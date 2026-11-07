import type { ReactNode } from "react";
import { BatteryFull, Signal, Wifi } from "lucide-react";
import "./phone-preview.css";

export function PhonePreview({
  children,
  app,
  variant,
}: {
  children: ReactNode;
  app: string;
  variant: "planner" | "game";
}) {
  return (
    <div
      className={`phone-preview phone-${variant}`}
      role="group"
      aria-label={`${app} on iPhone 18 Pro Max`}
    >
      <div className="phone-glass">
        <div className="phone-status" aria-hidden="true">
          <span>9:41</span>
          <i className="phone-island" />
          <div>
            <Signal size={16} />
            <Wifi size={16} />
            <BatteryFull size={21} />
          </div>
        </div>
        <div className="phone-app-screen">{children}</div>
        <div className="phone-home" aria-hidden="true">
          <i />
        </div>
      </div>
    </div>
  );
}
