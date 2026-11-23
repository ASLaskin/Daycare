// Gateway session: hello, reconnect with backoff, request and response.

import DaycareKit
import Foundation
import Observation

@MainActor
@Observable
final class Connection {
  enum Phase: Equatable {
    case idle
    case connecting
    case online
    case retrying(at: Date)
    case noNetwork
    // Terminal until relaunch
    case mismatch(ProtocolMismatch)
    // Terminal until paired again
    case unauthorized
    // Another connection with this device id took over
    case replaced
  }

  struct HelloContext {
    var resume: Resume?
    var watch: Watch
  }

  private(set) var phase: Phase = .idle
  private(set) var coordinatorVersion: String?
  private(set) var lastError: GatewayError?

  @ObservationIgnored var helloContext: () -> HelloContext = { HelloContext(resume: nil, watch: Watch(sessions: [], deltas: true)) }
  @ObservationIgnored var onWelcome: (Welcome) -> Void = { _ in }
  @ObservationIgnored var onMessage: (ServerMessage) -> Void = { _ in }
  @ObservationIgnored var onUnauthorized: () -> Void = {}

  @ObservationIgnored private var link: PairingLink?
  @ObservationIgnored private var device: DeviceId?
  @ObservationIgnored private var socket: Socket?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var backoff = Backoff()
  @ObservationIgnored private var retryTask: Task<Void, Never>?
  @ObservationIgnored private var wanted = false
  @ObservationIgnored private let pending = PendingRequests()
  @ObservationIgnored private let session: URLSession = {
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 45
    config.waitsForConnectivity = false
    return URLSession(configuration: config)
  }()

  var isOnline: Bool { phase == .online }

  var isTerminal: Bool {
    switch phase {
    case .mismatch, .unauthorized:
      return true
    case .idle, .connecting, .online, .retrying, .noNetwork, .replaced:
      return false
    }
  }

  func configure(link: PairingLink?, device: DeviceId) {
    teardown()
    self.link = link
    self.device = device
    phase = .idle
  }

  // Foreground: connect, or check a socket that may have gone stale
  func start() {
    wanted = true
    if case .replaced = phase {
      phase = .idle
    }
    guard socket == nil else {
      verify()
      return
    }
    connect()
  }

  // Background: iOS suspends sockets anyway
  func stop() {
    wanted = false
    teardown()
    if !isTerminal {
      phase = .idle
    }
  }

  func networkChanged(satisfied: Bool) {
    guard wanted, !isTerminal else {
      return
    }
    guard satisfied else {
      if socket == nil {
        cancelRetry()
        phase = .noNetwork
      }
      return
    }
    guard socket == nil else {
      verify()
      return
    }
    backoff.reset()
    connect()
  }

  func request(_ command: MobileCommand, key: RequestKey? = nil) async throws -> (result: JSONValue, replayed: Bool) {
    guard phase == .online, let socket else {
      throw RequestFailure.offline
    }
    let id = pending.mint()
    let message = ClientMessage.request(Request(id: id, key: key, command: command))
    return try await withCheckedThrowingContinuation { continuation in
      pending.wait(id, continuation: continuation)
      Task {
        do {
          try await socket.send(message)
        } catch {
          pending.fail(id, .offline)
        }
      }
    }
  }

  func request<T: Decodable>(_ command: MobileCommand, key: RequestKey? = nil, as type: T.Type) async throws -> T {
    let (result, _) = try await request(command, key: key)
    do {
      return try result.decode(type)
    } catch {
      throw RequestFailure.undecodable
    }
  }

  private func connect() {
    guard wanted, socket == nil, !isTerminal, let link, let device, let url = link.socketURL else {
      return
    }
    cancelRetry()
    generation += 1
    let current = generation
    let socket = Socket(url: url, session: session)
    self.socket = socket
    phase = .connecting
    socket.open()
    let context = helloContext()
    let hello = Hello(
      protocol: WireProtocol.version,
      app: AppInfo.build,
      token: link.token,
      device: device,
      resume: context.resume,
      watch: context.watch
    )
    Task {
      do {
        try await socket.send(.hello(hello))
        for try await message in socket.messages() {
          guard current == generation else {
            return
          }
          handle(message)
        }
        ended(current, closeCode: socket.closeCode)
      } catch {
        ended(current, closeCode: socket.closeCode)
      }
    }
  }

  private func handle(_ message: ServerMessage) {
    switch message {
    case .welcome(let welcome):
      phase = .online
      backoff.reset()
      coordinatorVersion = welcome.coordinator
      onWelcome(welcome)
      onMessage(message)
    case .response(let response):
      pending.resolve(response)
    case .protocolMismatch(let mismatch):
      phase = .mismatch(mismatch)
      teardown()
    case .error(let error):
      lastError = error.error
      if error.error.code == .unauthorized {
        phase = .unauthorized
        teardown()
        onUnauthorized()
      }
    case .snapshot, .event:
      onMessage(message)
    }
  }

  private func ended(_ ended: Int, closeCode: Int) {
    guard ended == generation else {
      return
    }
    socket = nil
    pending.failAll(.offline)
    switch CloseCode(rawValue: closeCode) {
    case .protocolMismatch:
      if case .mismatch = phase {
        return
      }
      phase = .mismatch(ProtocolMismatch(server: 0, client: WireProtocol.version))
    case .unauthorized:
      phase = .unauthorized
      onUnauthorized()
    case .replaced:
      phase = .replaced
    case .badHello, .stalled, .tooLarge, .stopping, nil:
      scheduleRetry()
    }
  }

  private func scheduleRetry() {
    guard wanted, !isTerminal else {
      return
    }
    let delay = backoff.next()
    phase = .retrying(at: Date().addingTimeInterval(delay))
    retryTask = Task {
      try? await Task.sleep(for: .seconds(delay))
      guard !Task.isCancelled else {
        return
      }
      connect()
    }
  }

  // Pings an open socket; a dead one reconnects at once
  private func verify() {
    guard let socket else {
      return
    }
    let current = generation
    Task {
      let alive = await socket.ping()
      guard !alive, current == generation else {
        return
      }
      teardown()
      backoff.reset()
      connect()
    }
  }

  private func cancelRetry() {
    retryTask?.cancel()
    retryTask = nil
  }

  private func teardown() {
    cancelRetry()
    generation += 1
    socket?.close()
    socket = nil
    pending.failAll(.offline)
  }
}
