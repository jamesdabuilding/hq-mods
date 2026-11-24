# hq-mods

Three Claude Code mods that turn a session into a headquarters.

| Mod | What it does |
|---|---|
| **hq-layout** | A deep-teal ink-wash look with an animated backdrop, a week strip above the prompt, and the HQ pane: a feed of what was built, today's plan, *Needs you*, **Sessions** (brief, reply to and stop your other Claude sessions), metrics and workflows. `/hq` |
| **agent-deck** | What every subagent is doing right now, with a live progress bar per agent and for the batch. `/deck` |
| **model-router** | Reads each task and picks the lightest model that will do it well: Haiku for search agents, Sonnet for build agents and quick questions, your model for hard work. Cache-aware, so it never trades a cheaper model for an expensive cache rebuild. `/route` |
| **warm-watch** | A desktop or phone notification before a chat's cache goes cold, with Keep warm and Compact now buttons, and optional compaction of big idle chats while they are still warm, so a rebuild costs a fraction. `/warm` |

## Install

Add the marketplace once, then install the mods you want. In a terminal (PowerShell works):

```bash
claude plugin marketplace add jamesdabuilding/hq-mods
```

```bash
claude plugin install hq-layout@hq-mods
```

```bash
claude plugin install agent-deck@hq-mods
```

```bash
claude plugin install model-router@hq-mods
```

```bash
claude plugin install warm-watch@hq-mods
```

Sessions already open pick them up with `/reload-plugins`. In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `jamesdabuilding/hq-mods`, then Add plugin.

warm-watch's Keep warm buttons need cache-tax. Its README has the three commands that set cache-tax to keep chats warm for a day and show a cold send's price without asking.

 If installing cache-tax fails with "Host key verification failed", git is trying SSH; make it use HTTPS for GitHub, then install again:

```bash
git config --global url."https://github.com/".insteadOf "git@github.com:"
```

## Notes

- HQ's Sessions view reads your sessions through Claude's own session tools. Approving a permission prompt in another session is not possible from HQ by design; **Open to approve** jumps straight to it.
- Set the HQ clock's time zone in `/config` (Clock time zone).
