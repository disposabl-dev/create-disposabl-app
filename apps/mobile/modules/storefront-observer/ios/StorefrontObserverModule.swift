import ExpoModulesCore
import StoreKit

public final class StorefrontObserverModule: Module {
  private var observers = 0
  private var task: Task<Void, Never>?

  public func definition() -> ModuleDefinition {
    Name("StorefrontObserver")
    Events("onStorefrontChange")

    AsyncFunction("start") { () -> Bool in
      guard #available(iOS 15.0, *) else { return false }
      if self.observers == 0 {
        let updates = Storefront.updates
        self.task = Task { [weak self] in
          for await _ in updates {
            guard !Task.isCancelled else { break }
            self?.sendEvent("onStorefrontChange", [:])
          }
        }
      }
      self.observers += 1
      return true
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      self.observers = max(0, self.observers - 1)
      if self.observers == 0 {
        self.task?.cancel()
        self.task = nil
      }
    }.runOnQueue(.main)

    OnDestroy {
      self.task?.cancel()
      self.task = nil
      self.observers = 0
    }
  }
}
