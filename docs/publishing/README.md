# Publishing your app

Use the [Apple checklist](apple.md) or [Google Play checklist](google-play.md) to publish your generated app. Store review and release are separate steps; a test build is not a public release.

## Release checklist

1. Merge the intended source to main and confirm CI is green. Build and test the signed native app from that source.
2. Complete the store listing, screenshots, support and privacy links, and review details.
3. Give reviewers working access to the actual features. Provide a review account and instructions; where needed, use scoped, preconnected test providers and complimentary credits. Verify the account can sign in and complete the advertised flow.
4. If the app sells digital products, configure the store products and matching app SKU and backend webhook settings. Exercise a real store sandbox or test purchase, including entitlement delivery and restoration as applicable.
5. Make privacy disclosures match the app and its providers. Explain AI data sharing and obtain consent where required; verify reporting and account deletion flows where applicable.
6. Submit the build and required purchase items, monitor review messages, and check the release setting and status before announcing availability.

## Updates

[Expo Update](https://docs.expo.dev/eas-update/) can deliver compatible JavaScript and asset updates to builds configured for it. Native changes, including native libraries or configuration affecting the runtime, need a new compatible build and store submission. Set the correct [runtime version](https://docs.expo.dev/eas-update/runtime-versions/) and follow each store's rules for updates.
