// Network reachability changes, from NWPathMonitor.

import Network

@MainActor
final class PathMonitor {
  private let monitor = NWPathMonitor()
  private(set) var satisfied = true
  var onChange: (_ satisfied: Bool) -> Void = { _ in }

  func start() {
    monitor.pathUpdateHandler = { [weak self] path in
      let satisfied = path.status == .satisfied
      Task { @MainActor in
        self?.update(satisfied)
      }
    }
    monitor.start(queue: .global(qos: .utility))
  }

  private func update(_ satisfied: Bool) {
    self.satisfied = satisfied
    onChange(satisfied)
  }
}
