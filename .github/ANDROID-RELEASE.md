# Android releases

Android builds use the selected production backend and channel. Without signing credentials the release APK uses the default debug key; it is installable but is not Play-ready. This key can change between runners, so replacing an installed app may require uninstalling it and losing local data. The manifest records the signing mode and certificate identity to prevent reuse across signing changes.

Configure either `DISPOSABL_ANDROID_SIGNING` or all four `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` secrets to produce a signed APK and AAB. Incomplete or invalid signing fails the build. Expo remains required for this pipeline's update integration.

Production inputs reject E2E configuration and require non-loopback HTTPS backend URLs. APKs and signed bundles are checked against the selected Expo configuration. A signed AAB also passes the pinned bundletool's structure, manifest, ABI and target SDK checks before it is retained. The fallback APK does not require bundletool or Play credentials. These checks do not establish Play account readiness or prove device behavior.

Play submission is separate and defaults off. Set `ANDROID_PLAY_SUBMIT` to `true`, select `ANDROID_PLAY_TRACK`, set `ANDROID_PLAY_UPLOAD_CERT_SHA256` to the lowercase SHA-256 of the upload certificate, and provide `ANDROID_PLAY_SERVICE_ACCOUNT` as a service-account JSON secret. Expo project and token are also required. This is an operator assertion that the Play app and access are configured; submission errors remain failures. Play account setup or a manual first upload may still be required, and submission does not mean review or rollout succeeded.

The Disposabl product uses the same artifact build, with production OTA updates disabled. Its Play submission also checks the product package and known upload certificate. The upload-key reset affects submission, not artifact builds.
