/** Only the mobile requirement can cross the handoff; the destination is fixed. */
export function mobileConnectionsDestination(search: string) {
  const mobile = new URLSearchParams(search).get("mobile") === "1";
  return `/dashboard/connections?origin=mobile${mobile ? "&mobile=1" : ""}`;
}
