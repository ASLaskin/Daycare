# Daycare

twin we need a read me, but i dont want the clanker to write it, or maybe he could in part

```sh
bun install
bun start
```

## coordinator

agents run in their own process now (the coordinator) so closing daycare doesnt kill them. its on by default on linux, on mac you gotta opt in for now

```sh
DAYCARE_COORDINATOR=1 bun start
```

set it to 0 if you want it off on linux
