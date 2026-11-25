/**
 * The two books an NGO's money is kept in — local (LC) and foreign (FC)
 * contribution — with their labels and chip tones. Shared by bank details,
 * budgets, credit / debit notes and the inflow / outflow budgets.
 */
export const BOOK = Object.freeze({
  LC: 'Local contribution',
  FC: 'Foreign contribution',
});

export const BOOK_TONE = Object.freeze({ LC: 'neutral', FC: 'graphite' });
