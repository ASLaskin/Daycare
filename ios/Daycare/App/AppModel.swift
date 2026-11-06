// Composition root: wires the connection to the stores, outbox, push and activity.

import DaycareKit
import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
  private(set) var pairing: PairingLink?
  var pushError: String?

  let router: Router
  let connection: Connection
  let store: SessionStore
  let transcripts: TranscriptStore
  let media: MediaStore
  let outbox: Outbox
  let push: PushRegistrar
  @ObservationIgnored let activity: ActivityController
  @ObservationIgnored private let status: StatusPublisher
  @ObservationIgnored private let path = PathMonitor()
  @ObservationIgnored private let device = Credentials.device()

  init() {
    let connection = Connection()
    let store = SessionStore()
    router = Router()
    self.connection = connection
    self.store = store
    transcripts = TranscriptStore(connection: connection, lastEntry: { store.sessions[$0]?.lastEntry })
    media = MediaStore(connection: connection)
    outbox = Outbox(connection: connection)
    push = PushRegistrar(connection: connection)
    activity = ActivityController(connection: connection, push: push)
    status = StatusPublisher(activity: activity)
    pairing = Credentials.loadPairing()
    wire()
    connection.configure(link: pairing, device: device)
    path.start()
    activity.observePushToStart()
    observeStatus()
  }

  var mediaEndpoint: MediaEndpoint? {
    pairing.map(MediaEndpoint.init)
  }

  func pair(_ link: PairingLink) {
    let changedMac = pairing.map { $0.host != link.host || $0.port != link.port } ?? true
    Credentials.savePairing(link)
    pairing = link
    if changedMac {
      resetData()
    }
    connection.configure(link: link, device: device)
    connection.start()
    Task {
      await push.requestAuthorization()
    }
  }

  // Forget this Mac entirely
  func unpair() async {
    await push.unregister()
    forgetToken()
    activity.endAll()
    resetData()
  }

  // Rejected token: scan again, keeping cached data for the same Mac
  func forgetToken() {
    connection.stop()
    Credentials.clearPairing()
    pairing = nil
    connection.configure(link: nil, device: device)
  }

  func foreground() {
    guard pairing != nil else {
      return
    }
    connection.start()
    Task {
      await push.refreshAuthorization()
    }
  }

  func background() {
    transcripts.saveAll()
    connection.stop()
  }

  func send(_ command: MobileCommand, photos: [OutgoingPhoto] = []) {
    do {
      try outbox.enqueue(command, photos: photos)
    } catch {
      pushError = "Photo is larger than 10 MB"
    }
  }

  private func wire() {
    connection.helloContext = { [unowned self] in
      Connection.HelloContext(resume: store.resume, watch: Watch(sessions: transcripts.watched, deltas: true))
    }
    connection.onWelcome = { [unowned self] welcome in
      store.welcome(welcome)
      outbox.drain()
      push.register()
      activity.reportTokens()
    }
    connection.onMessage = { [unowned self] message in
      handle(message)
    }
    connection.onUnauthorized = {}
    outbox.onUnauthorized = { [unowned self] in
      connection.stop()
    }
    outbox.onCreated = { [unowned self] _, session in
      router.open(session)
    }
    path.onChange = { [unowned self] satisfied in
      connection.networkChanged(satisfied: satisfied)
    }
  }

  private func handle(_ message: ServerMessage) {
    switch message {
    case .snapshot(let snapshot):
      store.apply(snapshot)
      transcripts.resyncOpen()
      transcripts.watched.forEach { session in
        Task {
          await media.refresh(session)
        }
      }
    case .event(let frame):
      route(frame)
    case .welcome, .response, .protocolMismatch, .error:
      return
    }
  }

  private func route(_ frame: EventFrame) {
    store.apply(frame)
    switch frame.event {
    case .chat(let chat):
      transcripts.applyLive(chat)
    case .media(let list):
      media.apply(list)
    case .removed(let removed):
      transcripts.removed(removed.session)
      media.removed(removed.session)
    case .session, .approval, .approvalResolved, .power, .catalog, .unknown:
      return
    }
  }

  private func resetData() {
    store.reset()
    transcripts.reset()
    media.reset()
    outbox.reset()
  }

  // Re-arms after every change to what the activity shows
  private func observeStatus() {
    withObservationTracking {
      _ = store.sessions
      _ = store.approvals
      _ = store.power
      _ = connection.phase
    } onChange: { [weak self] in
      Task { @MainActor in
        self?.publishStatus()
        self?.observeStatus()
      }
    }
  }

  private func publishStatus() {
    status.schedule { [weak self] in
      guard let self, let pairing, store.loaded else {
        return nil
      }
      let state = ActivityStateBuilder.build(
        sessions: Array(store.sessions.values),
        approvals: store.approvals.count,
        power: store.power,
        runningSince: store.runningSince,
        now: Date().timeIntervalSince1970
      )
      return (state, pairing.host, connection.isOnline)
    }
  }
}
