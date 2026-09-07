/**
 * One place on a map: a shape, a name, and somewhere to write its count.
 *
 * Shared by every layer so a level can be added without a second vocabulary.
 * The files that hold these are generated — see the header of any of them for
 * the commands that produce it.
 */
export interface PlaceShape {
  /**
   * The OCHA p-code, which is the join back to the source and stable across its
   * releases. Not used to look anything up here; it is the audit trail that
   * says which shape came from which record in the published dataset.
   */
  pcode: string;
  /** As written in Turkish. What the record is matched against. */
  name: string;
  /**
   * Where the count is written: the mean of the path's own vertices.
   *
   * Not a true centroid and not trying to be. It only has to land somewhere
   * inside a shape a number can sit on. Computed at build time so the page
   * ships coordinates rather than the arithmetic.
   */
  cx: number;
  cy: number;
  /** An SVG path, in the viewBox its layer declares. */
  d: string;
}
