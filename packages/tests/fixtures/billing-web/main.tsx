import React from "react";
import { createRoot } from "react-dom/client";
import { Route as Pricing } from "../../../disposabl-kit/client/routes/pricing";
import { Gate } from "./gate";
import { Route as Login } from "../../../disposabl-kit/client/routes/billing-login";
const Component =
  location.pathname === "/gate"
    ? Gate
    : location.pathname === "/billing-login"
      ? Login.options.component
      : location.pathname === "/checkout"
        ? () => (
            <main>
              <h1>Fixture checkout</h1>
              <a href="/pricing">Return to pricing</a>
            </main>
          )
        : location.pathname === "/portal"
          ? () => <h1>Fixture billing portal</h1>
          : Pricing.options.component;
createRoot(document.getElementById("root")!).render(<Component />);
