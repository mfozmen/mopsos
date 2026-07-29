/**
 * What the page gets. Compiled into the generated HTML so the calculator in the
 * browser and the tests in CI run the same code — a second, hand-written copy of
 * a payment formula would disagree with this one eventually, and silently.
 */
export * from './mortgage.js';
export * from './format.js';
export * from '../ui/sort.js';
