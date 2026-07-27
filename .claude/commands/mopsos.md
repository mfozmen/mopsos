---
description: Open the Mopsos interface and take research requests from it
---

Start the interface and then watch it for work.

1. Regenerate the page from the record and start the local server:

   ```
   npm run ui
   npm run dev
   ```

   Run `npm run dev` with `run_in_background: true` — it does not exit. If port 8787 is
   already taken, the server is already up; do not start a second one.

2. Open `http://127.0.0.1:8787` in the browser for the user, and tell them the address in
   case it does not open by itself.

3. Arm a **persistent Monitor** on the request queue so their button presses reach this
   session:

   ```
   tail -n 0 -F "<data-dir>/requests.jsonl"
   ```

   Resolve `<data-dir>` the way the code does — `MOPSOS_DATA_DIR`, else `../mopsos-data`,
   else `private/`. Create the file first if it does not exist (`tail -F` on a missing file
   is fine but noisy). Description: "mopsos istekleri".

## When a request arrives

**Claim it before acting.** Another session may be watching the same queue:

```
npm run queue                          # what is pending
npm run queue -- claim <requested_at>  # take one
```

If `npm run queue` no longer lists it, someone else has it — say so and do nothing. Six
scouts once re-read what six others had read minutes earlier, and the only reason it was not
pure waste is that the readings happened to agree.

Each line is one JSON request. Act on it, then tell the user in one line what you did.

| `kind`   | What to do                                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rates`  | Dispatch the **rate-scout** agent once per bank, in parallel — Ziraat, VakıfBank, Halkbank, İş Bankası, Garanti BBVA, Yapı Kredi, Akbank, QNB, DenizBank, TEB, and the participation banks Kuveyt Türk, Albaraka, Ziraat Katılım, Vakıf Katılım, Emlak Katılım. Skip any read within the last three days — rates move weekly, not hourly, and re-reading annoys the bank's server for nothing. |
| `market` | Dispatch the market research agent for the given province and district                                                                                                                                                                                                                                                                                                                         |

Then run `npm run ui` so the page picks up what landed, and tell the user to refresh.

## Rules

**Never invent a result to satisfy a request.** If the agents come back with nothing, say so
on the page and in the chat. A request that silently produces nothing is the failure this
whole design exists to avoid.

**Do not write research into this repository.** It is public. Everything the agents produce
belongs in the private data directory.

**One request, one action.** If several land at once, handle them in order and say which you
are on. Do not batch them into a single vague run.
