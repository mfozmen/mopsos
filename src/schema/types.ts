export type ResolutionSource = 'evds' | 'tuik' | 'listing_snapshot' | 'market_close';

export interface Resolution {
  source: ResolutionSource;
  series: string;
  reference_period: string;
  check_after: string;
  rule: string;
  print: 'first';
}

export interface Verdict {
  schema_version: 1;
  id: string;
  seer: string;
  /** Must match a registered module; see src/modules/asset-class.ts. */
  asset_class: string;
  question: string;
  probability: number;
  created_at: string;
  due_at: string;
  calibration_probe_of?: string;
  resolution: Resolution;
}

export interface Outcome {
  schema_version: 1;
  id: string;
  verdict_id: string;
  resolved_at: string;
  observed_value: number;
  print: 'first';
  hit: boolean;
  corrects?: string;
}
