# Dedicated servers

Normally the first player into an empty public server (INFANTRY 1, ALL-OUT 2, ...) hosts it on their own phone or
PC. With a dedicated server the game itself runs on a machine that is always on: it hosts every public server
round the clock, with its bots fighting even when nobody is in, and everyone who comes in simply **joins**.
Leave and the server goes on. If the dedicated machine is ever down, the game falls back to the old way by itself
(a player hosts).

`server.mjs` opens one headless Chromium page per server (`index.html?dedicated=aio-1`), which hosts that server
and never plays in it itself; it doesn't draw anything and runs the battle at 30 updates a second. A page that
crashes or stops hosting is reloaded, and the service restarts if anything else goes wrong.

## Putting it on a free Oracle Cloud machine

Oracle's Always Free tier includes an Arm machine with **4 cores and 24 GB of memory** and 10 TB of traffic a
month, which is plenty for all six servers (two ALL-OUT servers with 100 soldiers a side included).

1. Make an account at **cloud.oracle.com** (Always Free; it asks for a card to check who you are, but the free
   machine costs nothing).
2. **Compute → Instances → Create instance.**
   - **Image:** Canonical Ubuntu 24.04. **Shape:** Ampere, `VM.Standard.A1.Flex`, 4 OCPUs, 24 GB memory.
     (If it says "out of capacity", try another availability domain, or fewer OCPUs, or try again later.)
   - **Networking:** create a new virtual cloud network with a public subnet, and keep "Assign a public IPv4
     address" on.
   - **SSH keys:** "Generate a key pair for me" and **Save private key** (a file ending in `.key`). Keep it safe.
   - Create, and when it is running copy its **Public IP address**.
3. *(Optional, for the lowest delay)* In the instance's subnet, **Security List → Add Ingress Rule**: source
   `0.0.0.0/0`, IP protocol **UDP**, destination port range `1024-65535`. Without it players still connect,
   through the relay.
4. In GitHub: the repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `ORACLE_HOST`: the public IP address.
   - `ORACLE_SSH_KEY`: the whole private key file (open it in a text editor, copy everything, paste).
5. **Actions → Dedicated servers → Run workflow.** It builds the game, copies it to the machine, installs Node.js
   and Chromium, and starts the servers as a service. From then on every game update redeploys them by itself.

To see what they're doing: `ssh -i your.key ubuntu@<IP>` then `journalctl -u sixthfront -f` (one line per
server whenever it changes: hosting, how many players, the map).

Which servers it hosts: `SERVERS` (default `inf-1,tank-1,air-1,sea-1,aio-1,aio-2`); set it before running
`setup.sh` to change the list. Servers beyond these (INFANTRY 2 when INFANTRY 1 is full, ...) are still hosted
by players.

## Running it anywhere else

Any always-on Linux machine with Node.js 20 works: from a checkout of the game,
`npm install && npm install playwright && npx playwright install --with-deps chromium && node dedicated/server.mjs`.
