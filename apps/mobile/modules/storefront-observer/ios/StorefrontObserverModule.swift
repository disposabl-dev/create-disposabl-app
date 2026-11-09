import ExpoModulesCore
import StoreKit

// All mutable state is confined to the main dispatch queue, including teardown.
// Registration is synchronous. RevenueCat remains the transaction owner.
private final class StorefrontObservation: NSObject, SKPaymentTransactionObserver {
  private var observers = 0
  private var changed: (() -> Void)?

  func start(changed: @escaping () -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))
    self.changed = changed
    observers += 1
    if observers == 1 { SKPaymentQueue.default().add(self) }
  }

  func stop(all: Bool = false) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard observers > 0 else { return }
    observers = all ? 0 : observers - 1
    if observers == 0 {
      SKPaymentQueue.default().remove(self)
      changed = nil
    }
  }

  func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
    // Required protocol callback. Never finish, acknowledge, or modify purchases.
  }

  func paymentQueueDidChangeStorefront(_ queue: SKPaymentQueue) {
    DispatchQueue.main.async { [weak self] in self?.changed?() }
  }
}

public final class StorefrontObserverModule: Module {
  private let observation = StorefrontObservation()

  public func definition() -> ModuleDefinition {
    Name("StorefrontObserver")
    Events("onStorefrontChange")

    AsyncFunction("start") { () -> Bool in
      self.observation.start { [weak self] in
        self?.sendEvent("onStorefrontChange", [:])
      }
      return true
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      self.observation.stop()
    }.runOnQueue(.main)

    OnDestroy {
      let observation = self.observation
      DispatchQueue.main.async { observation.stop(all: true) }
    }
  }
}
