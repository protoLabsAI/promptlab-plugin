---
name: prompt-lab
description: Use managed prompts from the Prompt Lab library — list, read, render with variables, and save reusable prompts the operator can version and test in the playground.
---

# Prompt Lab — managed prompts

The Prompt Lab plugin keeps a library of versioned prompt templates that you and
the operator share. The operator edits and test-runs them in the Prompt Lab
console view; you use them through four tools.

## Using a managed prompt

1. `list_prompts()` — see what exists (id, name, description, tags).
2. `get_prompt(prompt_id)` — read one: its messages, `{{variable}}` names, and the
   model/params it was tuned for.
3. `render_prompt(prompt_id, variables_json)` — get the messages with every
   `{{variable}}` filled in, ready to use. It errors if you omit a variable the
   prompt needs, so call `get_prompt` first when unsure.

Prefer a managed prompt over improvising when one matches the task — it encodes
wording the operator has already iterated on and approved.

## Saving one

`save_prompt(prompt_id, name, system_prompt, user_template, ...)` creates or
updates a prompt. Use `{{variable}}` placeholders for anything that changes per
use. Updates archive the previous version automatically, so you will not destroy
the operator's work — but still prefer NEW ids for experiments and leave prompts
the operator owns alone unless asked to change them.

## When the operator asks to "run" a prompt

The playground (console → Prompt Lab) is where runs happen with streaming and
model selection. You can also render a prompt and continue with it yourself in
the current conversation when that is what the operator wants.
