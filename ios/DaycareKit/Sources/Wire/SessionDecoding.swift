// MobileSession decoding that tolerates coordinators without masterMode.

extension MobileSession {
  private enum Keys: String, CodingKey {
    case id, provider, nativeId, role, masterMode, parentId, name, icon, cwd, model, effort, permissionMode, state
    case closed, archived, error, createdAt, run, accountId, configDir, live, lastEntry, lastEventAt, preview
  }

  public init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: Keys.self)
    let role = try c.decode(SessionRole.self, forKey: .role)
    self.init(
      id: try c.decode(SessionId.self, forKey: .id),
      provider: try c.decode(Provider.self, forKey: .provider),
      nativeId: try c.decodeIfPresent(NativeId.self, forKey: .nativeId),
      role: role,
      // Older coordinators ran every top-level session as a master
      masterMode: try c.decodeIfPresent(Bool.self, forKey: .masterMode) ?? (role == .master),
      parentId: try c.decodeIfPresent(SessionId.self, forKey: .parentId),
      name: try c.decode(String.self, forKey: .name),
      icon: try c.decodeIfPresent(String.self, forKey: .icon),
      cwd: try c.decode(DirPath.self, forKey: .cwd),
      model: try c.decodeIfPresent(String.self, forKey: .model),
      effort: try c.decodeIfPresent(String.self, forKey: .effort),
      permissionMode: try c.decode(PermissionMode.self, forKey: .permissionMode),
      state: try c.decode(SessionState.self, forKey: .state),
      closed: try c.decode(Bool.self, forKey: .closed),
      archived: try c.decode(Bool.self, forKey: .archived),
      error: try c.decodeIfPresent(String.self, forKey: .error),
      createdAt: try c.decode(Double.self, forKey: .createdAt),
      run: try c.decode(Double.self, forKey: .run),
      accountId: try c.decode(AccountId.self, forKey: .accountId),
      configDir: try c.decodeIfPresent(DirPath.self, forKey: .configDir),
      live: try c.decode(Bool.self, forKey: .live),
      lastEntry: try c.decodeIfPresent(Entry.self, forKey: .lastEntry),
      lastEventAt: try c.decodeIfPresent(Double.self, forKey: .lastEventAt),
      preview: try c.decodeIfPresent(String.self, forKey: .preview)
    )
  }
}
