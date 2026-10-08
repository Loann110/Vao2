# Working on Vao2

Rules for anyone changing this code, people and AI agents alike. Read
[ARCHITECTURE.md](ARCHITECTURE.md) first to find where things live, and
[CONTRIBUTING.md](CONTRIBUTING.md) for how the code is written.

The goal is code that a beginner can open and follow. Less code is better code.

## Before writing anything

Go down this list and stop at the first answer that works:

1. **Is it needed?** If nobody asked for it, leave it out.
2. **Is it already in Vao2?** Look in `frontend/global/` and `backend/` and reuse it.
3. **Does Python or the browser already do it?** Use the standard library or a
   built-in Web API.
4. **Does a library we already install do it?** Check `requirements.txt` and
   `frontend/global/vendor/`.
5. **Only then** write it yourself, as short and plain as it can be.

Read the code you are about to change, and every place that calls it. Fix the
cause once, where it starts, not in each caller.

## Keep it simple

- Functions, not classes. No base classes, factories or managers.
- No layer, option or setting "for later". Add it on the day it is needed.
- A new dependency needs a good reason; a few lines of our own code often beat it.
- Deleting code is a good change.
- One change at a time: keep the diff small and about one thing.
- For a big request, ship a small version that works and say what it leaves out.

## Never cut

Making code shorter never means dropping:

- checks on user input and on what the backend receives;
- error messages the user can understand;
- security (no secrets in the code, no running untrusted content);
- accessibility (labels, keyboard use, contrast);
- anything the user explicitly asked for.

Write tests only when asked.
