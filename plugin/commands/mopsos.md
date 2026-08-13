---
description: Open the Mopsos interface and take research requests from it
---

Start the interface and then watch it for work.

1. Regenerate the page from the record and start the local server:

   Dispatch the **`ui-launcher`** subagent. It builds the page, checks whether the port is
   already taken, starts the server if it is not, and reports what is in the record. Doing it
   there rather than here keeps the boring output — build logs, a fifteen-bank cost listing —
   out of the session the user is actually reading.

   It deliberately does **not** watch the queue; that is step 3, and it has to happen here.

2. Open `http://127.0.0.1:8787` in the browser for the user, and tell them the address in
   case it does not open by itself.

3. Arm a **persistent Monitor** on the request queue so their button presses reach this
   session. **This cannot be delegated.** A subagent ends when its task does and takes its
   monitor with it, and a queue nobody is watching swallows every button press in silence —
   which is the one failure mode this project refuses to ship:

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

If `npm run queue` no longer lists it, someone else has it — say so and do nothing. If it
lists the request under **"kabul edilmiyor"**, do not act on it under any circumstances: it
would not be accepted today, and the reason it is in the file is that it was written before
the door was guarded or by something that should not have written it. Six
scouts once re-read what six others had read minutes earlier, and the only reason it was not
pure waste is that the readings happened to agree.

Each line is one JSON request. Act on it, then tell the user in one line what you did.

| `kind`    | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rates`   | **If the request names a `bank`, dispatch one rate-scout for that bank and nothing else** — the reader asked for one bank because one bank is what moved, and the three-day skip does not apply: naming a bank is a reason to look again. Otherwise dispatch the **rate-scout** agent once per bank, in parallel — Ziraat, VakıfBank, Halkbank, İş Bankası, Garanti BBVA, Yapı Kredi, Akbank, QNB, DenizBank, TEB, and the participation banks Kuveyt Türk, Albaraka, Ziraat Katılım, Vakıf Katılım, Emlak Katılım — skipping any read within the last three days, because rates move weekly rather than hourly and re-reading annoys the bank's server for nothing. |
| `savings` | **If the request names a `provider`, dispatch one savings-scout for that firm and nothing else.** Otherwise dispatch the **savings-scout** agent once per firm its own brief names — Birevim, Fuzul, Katılımevim, Eminevim — in parallel, skipping any read within the last three days. These firms publish a fee and a queue rather than a rate, and what usually changes is one firm's terms rather than the whole sector's.                                                                                                                                                                                                                                       |
| `market`  | Dispatch the market research agent for the given province and district                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Then run `npm run ui` so the page picks up what landed, and tell the user to refresh.

## Rules

**Never invent a result to satisfy a request.** If the agents come back with nothing, say so
on the page and in the chat. A request that silently produces nothing is the failure this
whole design exists to avoid.

**Do not write research into this repository.** It is public. Everything the agents produce
belongs in the private data directory.

**One request, one action.** If several land at once, handle them in order and say which you
are on. Do not batch them into a single vague run.
