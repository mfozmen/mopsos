import { type RateOffer } from './load.js';

/**
 * A life situation an offer is only open to.
 *
 * One value today. The record already shows this is how these products are
 * priced — Halkbank alone has "Yeni Evlilere Özel" and "Vefa" (şehit yakını /
 * gazi), several banks run first-home rates, and VakıfBank has OYAK and TSK
 * campaigns that publish no rate at all — so the shape is a list from the
 * start rather than a boolean that has to be widened later.
 */
export type Gate = 'newlywed';

/**
 * Read out of what the bank published, never recorded onto the reading.
 *
 * A reading is a record and is never edited after the fact, so an eligibility
 * field added to one today would be a rewrite of what was read then. The
 * condition text is already there, verbatim, and this derives from it.
 *
 * Deliberately narrow, and it fails towards showing the offer. Missing a gate
 * leaves the reader where they already are — looking at an offer they may not
 * qualify for — while inventing one hides a rate they could have had.
 */
// The roots rather than one bank's sentence. "evlilik süresi", "evlenme
// tarihi", "evlendikten sonra" and "nikâh tarihi" are the same gate written
// four ways, and matching only the phrasing in front of us would make Halkbank's
// wording the definition of the condition.
//
// `evli` on its own is left out deliberately: it appears in sentences that
// impose nothing ("evli olsun olmasın"), and a false positive here hides a rate
// the reader could have had.
const MARRIAGE = /yeni evli|evlilik|evlen(me|dik)|nik[aâ]h/i;

export function gatedOn(offer: RateOffer): Gate[] {
  return MARRIAGE.test(`${offer.product} ${offer.conditions ?? ''}`) ? ['newlywed'] : [];
}
