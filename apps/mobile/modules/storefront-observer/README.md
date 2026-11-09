# Storefront observation

This local iOS Expo module invalidates cached website-checkout eligibility when StoreKit reports a storefront change. It registers a retained `SKPaymentTransactionObserver` synchronously before `start()` resolves. Its required transaction callback is intentionally empty; RevenueCat owns purchase processing.

Observation is reference-counted on the main dispatch queue. Each successful start needs a stop, and module destruction removes all remaining observation. Missing native support leaves website checkout unavailable.

StoreKit callback delivery to JavaScript is asynchronous. The billing hook also rechecks eligibility before browser handoff and cancels when an observed change invalidates that operation. These checks do not make the storefront read and browser opening atomic or monitor a checkout after the browser opens.

The queue observer API is deprecated, but provides a documented registration boundary. Do not replace it with an unawaited `Storefront.updates` task and assume observation is already active when the start call returns.
