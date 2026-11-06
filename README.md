# Daycare

twin we need a read me, but i dont want the clanker to write it, or maybe he could in part

```sh
bun install
bun start
```

## coordinator

agents run in their own process (the coordinator) so closing daycare doesnt kill them. its the only way sessions run now, mac and linux

on mac daycare installs a launch agent (`~/Library/LaunchAgents/com.daycare.coordinator.plist`) so the coordinator comes back after a crash or reboot without opening the app. logs go to `~/Library/Logs/Daycare/coordinator.log`. on linux its a systemd user service (`daycare-coordinator.service`)

to get rid of it on mac:

```sh
launchctl bootout gui/$(id -u)/com.daycare.coordinator
rm ~/Library/LaunchAgents/com.daycare.coordinator.plist
```
