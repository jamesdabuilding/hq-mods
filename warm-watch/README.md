# warm-watch

A notification shortly before a conversation's prompt cache goes cold, so you can keep it warm instead of paying to re-cache the whole context on your next message.

- When a turn ends in a conversation of 30k+ tokens, warm-watch books a notification on your desktop or phone for 10 minutes before the cache is expected to go cold. It fires only if you have left the session.
- In the session, a row appears above the prompt in that window: **Keep warm 90m**, **3h**, or **Let it cool**. Keep warm runs cache-tax's `/keepwarm`.
- `/warm` shows how long the cache has left; `/warm 90m` keeps it warm.
- Needs [cache-tax](https://github.com/karanb192/claude-code-mods) for the Keep warm buttons. Times, the warning lead and the size threshold are in `/config`.
