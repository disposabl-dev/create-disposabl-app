# Publish to Apple

Start with the [shared release checklist](README.md), then use App Store Connect:

- [ ] Create the app record and upload a signed iOS build. Test the build and its key flows on a device.
- [ ] Complete the listing, screenshots, privacy information and [App Review information](https://developer.apple.com/app-store/review/). Supply working review credentials and steps, including access to paid or provider-dependent features.
- [ ] Configure purchases, subscription groups and matching backend notifications if used. Test the purchase and entitlement flow in [Apple's sandbox](https://developer.apple.com/documentation/storekit/testing-in-app-purchases-with-sandbox).
- [ ] For the first purchase of each type, add the new app version and purchase to the same draft submission. Add a new subscription group with its subscription to that submission too. See [Apple's submission instructions](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/).
- [ ] Submit for review, respond to requests and check whether release is automatic or manual. A waiting-for-review status does not mean the app is live.

Review the [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) for the current requirements, including privacy, account deletion and payments.
