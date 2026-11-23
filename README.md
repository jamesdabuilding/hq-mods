# hq-mods

Three Claude Code mods that turn a session into a headquarters.

| Mod | What it does |
|---|---|
| **hq-layout** | A deep-teal ink-wash look with an animated backdrop, a week strip above the prompt, and the HQ pane: a feed of what was built, today's plan, *Needs you*, **Sessions** (brief, reply to and stop your other Claude sessions), metrics and workflows. `/hq` |
| **agent-deck** | What every subagent is doing right now, with a live progress bar per agent and for the batch. `/deck` |
| **model-router** | Reads each task and picks the lightest model that will do it well: Haiku for search agents, Sonnet for build agents and quick questions, your model for hard work. Cache-aware, so it never trades a cheaper model for an expensive cache rebuild. `/route` |
| **warm-watch** | A notification on your desktop or phone shortly before a conversation's cache goes cold, and Keep warm buttons above the prompt (needs cache-tax). `/warm` |

## Install

At the prompt of a terminal session:

```
/plugin install hq-layout --marketplace jamesdabuilding/hq-mods
/plugin install agent-deck --marketplace jamesdabuilding/hq-mods
/plugin install model-router --marketplace jamesdabuilding/hq-mods
/plugin install warm-watch --marketplace jamesdabuilding/hq-mods
```

From a shell:

```bash
claude plugin install hq-layout --marketplace jamesdabuilding/hq-mods
```

```bash
claude plugin install agent-deck --marketplace jamesdabuilding/hq-mods
```

```bash
claude plugin install model-router --marketplace jamesdabuilding/hq-mods
```

```bash
claude plugin install warm-watch --marketplace jamesdabuilding/hq-mods
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `jamesdabuilding/hq-mods`, then Add plugin.

This repository is private: installing needs a machine whose git can already read it (an SSH key, or `gh auth login` then `gh auth setup-git`).

## Notes

- HQ's Sessions view reads your sessions through Claude's own session tools. Approving a permission prompt in another session is not possible from HQ by design; **Open to approve** jumps straight to it.
- Set the HQ clock's time zone in `/config` (Clock time zone).
