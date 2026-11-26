# Addis 4H stream watchdog

A small Python program for the Linux PC that runs OBS. Every minute it checks:

1. **OBS** – is it running, is it streaming, is data still going out? (through OBS's WebSocket)
2. **YouTube** – does your channel's `/live` page really show a live broadcast?

A problem has to show up **3 checks in a row** (about 3 minutes) before it does anything. Then:

| What it sees | What it does |
|---|---|
| OBS closed, crashed or frozen | restarts OBS, which goes live again by itself |
| OBS open but not streaming, or no data going out | presses **Start Streaming** (or stops and starts it) |
| OBS says streaming but YouTube is **not live** | stops and starts the stream; if that fails twice, restarts OBS |
| No internet | waits, because restarting would not help |
| YouTube page can't be loaded | not counted as a failure |

After each restart it waits 3 minutes so YouTube has time to show the stream as live. It never restarts OBS more than 4 times an hour. Each action is written to `watchdog.log` and, if you want, sent to you on Telegram.

## Setup (once)

1. **OBS WebSocket:** in OBS go to *Tools → WebSocket Server Settings*. Tick *Enable WebSocket server*, keep port **4455**, set a password, then click *Apply*.
2. **YouTube:** in YouTube Studio → *Go live* → *Stream*, use a **persistent stream key** and turn on **Auto-start** and **Auto-stop**. Then YouTube goes live again on its own when OBS reconnects. Without Auto-start, a restarted stream stays "ready" and never goes live.
3. **Install:**
   ```bash
   mkdir -p ~/addis4h-watchdog && cp obs_watchdog.py watchdog.example.ini ~/addis4h-watchdog/
   cd ~/addis4h-watchdog
   python3 -m pip install --user obsws-python requests   # add --break-system-packages if pip says externally-managed-environment
   python3 -c "import obsws_python; print('OBS library OK')"
   cp watchdog.example.ini watchdog.ini
   nano watchdog.ini                         # OBS password, your channel URL, optional Telegram
   ```
4. **Test while OBS is streaming:**
   ```bash
   python3 obs_watchdog.py --check-once      # one check: prints what OBS and YouTube report, changes nothing
   python3 obs_watchdog.py --test-telegram   # only if you set Telegram
   python3 obs_watchdog.py --dry-run         # full loop, only logs what it WOULD do (Ctrl+C to stop)
   ```
   You should see `OBS: streaming` and `YouTube: live`.
5. **Run it:** `python3 obs_watchdog.py`. Leave the terminal open, or set up autostart below.

## Start automatically after login

Use **one** of these:

- **Desktop autostart:** `cp addis4h-watchdog.desktop ~/.config/autostart/`
- **systemd user service** (restarts the watchdog too if it ever stops); see the comments in `addis4h-watchdog.service`.

OBS itself should also start at login with `--startstreaming`. If the watchdog finds OBS closed, it opens OBS itself.

## Notes

- If OBS is installed as a flatpak, use the flatpak `launch_cmd` line in `watchdog.ini`.
- Three channels (English, Arabic, Oromo…) on one PC means three OBS instances, each with its own WebSocket port. Run one watchdog per instance: `python3 obs_watchdog.py --config om.ini`.
- `watchdog.ini` holds your passwords. Keep it on the PC only.
- Tests: `python3 test_watchdog.py` runs 10 simulated failures (no OBS needed).
