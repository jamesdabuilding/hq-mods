# agent-deck

See what every subagent is doing, live. A row above the prompt shows how many agents are working, what the latest one is doing and a combined progress bar. `/deck` opens the Agents pane: one card per agent with its task, type and model, what it is doing right now (reading a file, searching, running a command), its own summary, a progress bar, elapsed time, tool calls, tokens and estimated cost.

Agents don't report a percentage, so the bar is an estimate: tool calls so far against how many that kind of agent usually takes. It learns those counts across sessions, so the bars get more accurate the more you use it. A bar stops at 95% until the agent reports, then shows done.
