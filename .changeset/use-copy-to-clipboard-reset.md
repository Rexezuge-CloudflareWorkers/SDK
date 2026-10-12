---
'@rexezuge/web': minor
---

Add `reset()` To `useCopyToClipboard`

`useCopyToClipboard` owned its feedback timer and could only clear `copied` by
waiting it out. A consumer that hides the affordance itself — a clone menu that
closes on an outside click, a tab no longer showing the field — is left holding
a stale `true` for a confirmation that is no longer on screen, and the only way
out is to wait.

`reset()` clears the feedback early and cancels the pending timer, so the later
unmount has nothing left to clear.
