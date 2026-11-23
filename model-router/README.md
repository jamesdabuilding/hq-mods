# model-router

Saves credits by reading each assignment and choosing the lightest model that will still do it well.

- **Subagents** (the biggest saving, and free of cache cost because each starts with an empty context): search and reading work goes to Haiku, build work to Sonnet, and planning, security, debugging and architecture stay on your model. A model Claude or you chose explicitly is never overridden.
- **Main conversation** (balanced mode): short questions and small changes run on Sonnet, but only while switching is cheap, meaning a small context or a prompt cache that has gone cold anyway. Hard work always runs on your model, and a follow-up like "yes, do it" keeps whatever model is running.
- It never routes above the model you picked, and it decides with local rules, so deciding costs nothing.

`/route` shows what it chose and why, tokens by model, plan usage and the session cost estimate. `/route aggressive | balanced | conservative | off`, `/route pin sonnet`, `/route auto`. Options are in `/config`.
