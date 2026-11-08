import React, { useCallback, useEffect, useState } from "react";
import { PaymentGate } from "../../../../apps/mobile/src/features/management/payment-gate";
import { foreground } from "./native";
export function Gate() {
  const [balance, setBalance] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const refresh = useCallback(async () => {
    const value = await (await fetch("http://127.0.0.1:3451/state")).json();
    setBalance(value.balance);
    return value.balance as number;
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <main>
      <button onClick={foreground}>Simulate app foreground</button>
      {done ? (
        <p>Gate continued</p>
      ) : (
        <PaymentGate
          customerId="alice"
          data={{
            balance,
            hasMonthlyPlan: false,
            monthlyCheckoutPending: false,
            nativeSubscriptionsEnabled: true,
          }}
          refresh={refresh}
          proceed={() => setDone(true)}
          cancel={() => {}}
        />
      )}
    </main>
  );
}
