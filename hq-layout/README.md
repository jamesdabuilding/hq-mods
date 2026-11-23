# hq-layout

Turns a Claude session into a headquarters, modeled on a calm "HQ" dashboard layout.

- **Look**: deep teal-black by night, pale sage by day, one warm peach accent. Replies sit on frosted glass cards, your messages are peach chips, tool calls are quiet pills.
- **Backdrop**: an original, animated ink-wash scene: contour-lined mountains, curling cream clouds and a slow river of light (desktop and mobile).
- **Week strip** above the prompt: this week's days with today in peach, plus *Needs you* (open plan items and unacknowledged errors) and *Automations* (tool runs in flight).
- **HQ pane** with a dock: *Sessions* (every Claude session you have, blocked ones first, each with a one-line brief, a reply box, Stop turn, and Open to approve), *Home* (a feed of prompts, edits, commands, research and finished turns as cards, with Open record), *Today* (the plan and its progress), *Needs you*, *Metrics* (session counts and tools by use) and *Workflows* (every tool run, live).
- **Sound** (optional, desktop): a low wind, rare distant chimes and soft cues. Turn it on with the speaker in the title bar.

`/hq [home|today|needs|sessions|metrics|workflows]` opens the pane on a view.

Replies sent from HQ reach the other session marked as coming from this one, and that session may confirm destructive steps with you there. Permission prompts can't be approved from another session by design: Open to approve takes you to it.

Set the clock's time zone with `/config` (Clock time zone, an IANA name such as `America/Chicago`); blank uses the machine's.
