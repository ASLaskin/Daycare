# Daycare

twin we need a read me, but i dont want the clanker to write it, or maybe he could in part

```sh
bun install
bun start
```

## Install

```sh
bun install
bun run package
```

On Linux this installs to `~/.local/opt/Daycare` and adds a launcher entry, `~/.local/share/applications/daycare.desktop`. On macOS it installs `/Applications/Daycare.app`. Run it again to update in place.

On Ubuntu 23.10 and later, Electron's sandbox needs an AppArmor profile for the installed executable. Add it once:

```sh
sudo tee /etc/apparmor.d/daycare >/dev/null <<EOF
abi <abi/4.0>,
include <tunables/global>

profile daycare $HOME/.local/opt/Daycare/Daycare flags=(unconfined) {
  userns,
  include if exists <local/daycare>
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/daycare
```
