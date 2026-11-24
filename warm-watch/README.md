# warm-watch

Keeps big chats cheap to come back to.

- **Heads-up before cold.** When a turn ends in a chat of 30k+ tokens, warm-watch books a desktop or phone notification for 10 minutes before the prompt cache is expected to go cold (it fires only if you have left). In the session, a row above the prompt offers **Keep warm 90m**, **3h**, **Compact now** or **Let it cool**.
- **Compact while warm.** Compacting reads the long chat from the cache at the cheap cache-read price; the next cold rebuild then only writes the short summary. Compacting after the cache is cold saves little, because the compaction itself must read the whole chat uncached. Turn on **Compact big chats when idle** in `/config` (20m, 30m or 45m; chats above 150k tokens by default) to have it happen by itself. A summary keeps the goal, decisions, open tasks and next step, not every detail, so it is off by default.
- **`/warm`** shows how long the cache has left and whether cache-tax is set to keep chats warm.

## Keep chats warm with cache-tax

warm-watch's Keep warm buttons drive [cache-tax](https://github.com/karanb192/claude-code-mods). Set cache-tax up once per machine so cold sends show their price without asking and every chat stays warm for a day after its last message:

```bash
claude plugin install cache-tax@claude-code-mods --config pingFloor=1
```

```bash
claude -p "/cache-tax guard warn"
```

```bash
claude -p "/keepwarm always 24h"
```

`pingFloor=1` lets keep-warm pings spend up to the cost of one cold rebuild before they stop (the default, 2, stops them at half). Pings run only while Claude Code is running.
