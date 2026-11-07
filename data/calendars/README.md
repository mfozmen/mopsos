# data/calendars/

Pinned publication calendars. `checkAfter(series, period)` in `src/calendar/calendar.ts`
reads every file here to decide the first date a value can exist, and `assertMeasurable`
rejects an `evds` verdict whose `check_after` comes before that date.

**Old files are never replaced or edited.** A verdict written in 2026 has to derive the same
date after 2027's calendar lands. Adding a year means adding a file.

## Refreshing each year

TCMB publishes the next year's calendar on the first business day of January. A test
(`assertCalendarCovers` in `src/calendar/calendar.test.ts`) fails in CI from 1 January until
the new year's file is committed. That is on purpose: without the file, every new verdict
gets an estimated `check_after` instead of a published one, and nothing else would notice.

1. Open the calendar at <https://appg.tcmb.gov.tr/igmvytsfe-dis/tr>. It is drawn from a
   public JSON service, 20 rows per page:

   ```
   https://appg.tcmb.gov.tr/igmvytsms-dis/veriTakvimi/list?yil=<year>&ay=<1..12>&gun=1&lang=tr&page=<0..>&size=20
   ```

   Page through every month until `last` is true, and remove duplicate rows by their `id`.

2. Keep the publications already pinned, matched by `yayinId`: `11` is _Konut Fiyat
   Endeksi_ and `39` is _Kredi Faiz Oranları (Haftalık Akım, Ağırlıklı Ortalama)_. Look them
   up again in `veriTakvimi/yayinAdi` in case TCMB renumbered them.

3. Write `tcmb-<year>.json` in the same shape as `tcmb-2026.json`. For each release:
   - `published` is the date part of `tarih`. The time is Istanbul local time with a
     misleading `Z` suffix, so drop it.
   - `reference_period` comes from `donem`. A month name and year (`Ekim 2026`) becomes
     `2026-10`. `N. Hafta YYYY` becomes the ISO week `YYYY-Www`.
   - `as_listed` is `donem` exactly as TCMB printed it.

   Copy each publication's `series` list from the previous year. To add a series, confirm its
   data group first with `https://evds3.tcmb.gov.tr/igmevdsms-dis/searchResults?searchVal=<code>`,
   then say in `notes` how it was matched.

4. Read the releases in order and check that the periods advance one at a time. TCMB's 2026
   listing labelled its December KFE release "Kasım 2025". Record what the release actually
   is, keep the printed text in `as_listed`, and explain the correction in `notes`.

5. Set `captured_at`, then commit the file in its own pull request.
