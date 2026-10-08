# Writing code in Vao2

Vao2 must stay readable by someone opening a file for the first time.
Write for that person, not for the fewest lines.

## General rules

- Explicit code over clever code; a few more lines are fine when they make the
  steps visible.
- Small functions named after what they do (`fetchFeed`, `renderSources`),
  not `handle` or `process`.
- Intermediate variables rather than long nested expressions.
- Several small files rather than one large file, organised by feature.
- No wrappers, managers or abstraction layers for something that can stay simple.
- Remove what is no longer used: dead functions, routes, CSS rules, files.

## Python

- A module starts with a short description: what it does, who calls it,
  what it deliberately does not do.
- Large modules are split into sections:

  ```python
  #/////////////////////////////////////////////////////////
  # SECTION NAME ///////////////////////////////////////////
  #/////////////////////////////////////////////////////////
  ```

- Long calls, lists and conditions are written vertically, one item per line.
- Comments explain *why* (a constraint, a surprising behaviour), never what
  the syntax already says.
- Routes (`backend/routes/`) stay short: check the request, call the logic,
  return the result. Logic that talks to an outside service goes in
  `backend/platforms/`; the database is only touched by `backend/db.py`.

## JavaScript

- One folder per part of the interface (`feed/`, `weather/`...), started from
  `main.js`. Shared helpers live in `global/`.
- Modules (`import` / `export`) instead of `window.something` globals, and
  `addEventListener` instead of `onclick="..."` in the HTML.
- Build the interface with `element()` (`global/dom.js`) rather than HTML
  strings, so text from feeds is never read as HTML.
- Separate fetching, drawing and wiring events into different functions.

## CSS

- Colours, fonts and sizes come from the variables in
  `global/styles/theme.css`.
- Each part of the interface has its own stylesheet next to its JavaScript.
- One property per line, a blank line between rules. Each selector is written
  once, with its final values, rather than overridden in another file.
- No rules for elements that no longer exist.

## Before sending a change

1. Start the app and use the part you changed, in both themes and on a narrow
   window.
2. Check the browser console has no errors.
3. Search for anything your change left unused.
