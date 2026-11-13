# Daycare

> Agent to babysit your agents

twin we need a README, but i dont want the clanker to write it, or maybe he could in part

---

heres a quick summary that will need updating:

`An electron app running on a bun server that gives master (the first session you open) an MCP to spawn subagents (terminals you can see and interact with) and choose their model and effort level.`

---

### why would need that?

`imagine you are doing cross repo work and one agent is overseeing the subagents in their individual repos. Or if you are clipping your youtube channel to make shorts and want to QA each short in a more organized fashion.`

basically, daycare lets you run a bunch of agents without having 15 terminal windows open and wondering which claude is doing what.

---

### any cool stuff? 

Andrews favorite things:

-you can manage your skills and inject them into each session through a sidebar.

-caffeinate your computer when a agent is running and even when the lid is closed.

-lose power? your sessions are safe, just reboot the app

-a remote control swift app is coming soon. it uses tailscale so you can connect to your laptop from anywhere as long as it's on. currently testing it.

there is other stuff too. you'll have to find it.

---

### getting started

```sh
bun install
bun start
```

---

### coordinator

agents now run in their own process through the coordinator, so closing daycare doesn't kill them.

it's on by default on linux. on mac you gotta opt in for now:

```sh
DAYCARE_COORDINATOR=1 bun start
```

set it to `0` if you want it off on linux.

---

thats basically it for now.
