# The Mopsos plugin

What used to sit in this repository's `.claude/` directory, packaged so it can be installed.

```
plugin/
  .claude-plugin/plugin.json   the manifest
  commands/mopsos.md           /mopsos — opens the interface and takes requests from it
  agents/ui-launcher.md        builds the page and gets the server up
  agents/rate-scout.md         reads one bank's housing finance terms
  agents/market-scout.md       researches one district, neighbourhood by neighbourhood
  agents/pdf-reader.md         pulls text out of a PDF
```

## Installing it

```
claude plugin marketplace add mfozmen/mopsos
claude plugin install mopsos@mopsos
```

While working on the plugin itself:

```
claude --plugin-dir ./plugin
```

## Why it moved out of `.claude/`

`.claude/` works, and it works only here. A plugin can be installed anywhere, is versioned,
and states what it contains. The tool is also the thing being built, so the two live in one
repository: the marketplace entry at the repository root points at `./plugin`.

**The agents had to move rather than be copied.** A project's own `.claude/agents/` overrides
a plugin agent of the same name, so leaving copies behind would have meant the plugin's
versions never ran while two files drifted apart. Commands are namespaced instead — a plugin
command is `/mopsos:mopsos` — so those could have coexisted; they moved anyway, because one
definition of a thing is the whole point.

## No version field, on purpose

The manifest carries no `version`, so Claude Code uses the git commit SHA and every commit is
a new version. That is what this tool wants right now: the one person using it is also the one
writing it, and pinning a number would only mean remembering to bump it. `semantic-release`
here cuts GitHub releases and does not write `package.json`, so there is nothing to stay in
sync with either. If the plugin is ever installed by somebody who is not tracking `main`, a
`version` field is the thing to add.

## No `monitors/monitors.json`, also on purpose

A plugin can declare a background monitor that starts when the plugin activates, and on paper
that is a tidier home for the request-queue watcher than an instruction inside `/mopsos`.

It is not used here, because whether such a monitor survives for the whole session is not
something the documentation settles, and the failure is silent: the interface's buttons would
keep writing to the queue, nothing would read it, and the only symptom is agents that never
run. This project's rule is that a collector which breaks quietly is worse than one that does
not exist. The `/mopsos` command arms the monitor itself, where it can be seen doing it.

Worth revisiting once the behaviour can be tested rather than assumed.
