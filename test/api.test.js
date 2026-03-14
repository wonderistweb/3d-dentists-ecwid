import { describe, it, expect } from 'vitest';
import { derivePrices } from '../src/api.js';

// ─── Helpers matching real Ecwid API combination shape ───────────────────────
// Ecwid returns: { options: [ { name: "X", value: "Y" }, ... ], price: N }

function makeCombo(optionPairs, price) {
  return {
    options: optionPairs.map(([name, value]) => ({ name, value })),
    defaultDisplayedPrice: price,
  };
}

// ─── Team Member course (like DGS) ──────────────────────────────────────────

describe('derivePrices — teamMembers', () => {
  const config = {
    type: 'teamMembers',
    hasDigitalAccess: true,
  };

  const product = {
    price: 2495,
    combinations: [
      makeCombo([['Registration', 'Apr 30 - May 1 2026 - Orlando FL'], ['Team Members', 'None']], 2495),
      makeCombo([['Registration', 'Apr 30 - May 1 2026 - Orlando FL'], ['Team Members', '1 Team Member']], 3990),
      makeCombo([['Registration', 'Apr 30 - May 1 2026 - Orlando FL'], ['Team Members', '2 Team Members']], 5485),
      makeCombo([['Registration', 'Team Only - Apr 30 - May 1 2026 - Orlando FL'], ['Team Members', 'None']], 0),
      makeCombo([['Registration', 'Team Only - Apr 30 - May 1 2026 - Orlando FL'], ['Team Members', '1 Team Member']], 1495),
    ],
    options: [
      {
        name: 'Digital Access',
        choices: [
          { text: 'No', priceModifier: 0 },
          { text: 'Yes', priceModifier: 395 },
        ],
      },
    ],
  };

  it('derives doctorPrice from base variation', () => {
    const prices = derivePrices(config, product);
    expect(prices.doctorPrice).toBe(2495);
  });

  it('derives teamMemberPrice from delta', () => {
    const prices = derivePrices(config, product);
    expect(prices.teamMemberPrice).toBe(1495);
  });

  it('derives digitalAccessPrice from option markup', () => {
    const prices = derivePrices(config, product);
    expect(prices.digitalAccessPrice).toBe(395);
  });

  it('skips digitalAccessPrice when config.hasDigitalAccess is false', () => {
    const noDA = { type: 'teamMembers', hasDigitalAccess: false };
    const prices = derivePrices(noDA, product);
    expect(prices.digitalAccessPrice).toBeUndefined();
  });
});

// ─── Assistant course (like AGS) ────────────────────────────────────────────

describe('derivePrices — assistants', () => {
  const config = {
    type: 'assistants',
    hasMastermind: true,
  };

  const product = {
    price: 17995,
    combinations: [
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic & Live Patients'], ['Assistants', 'None']], 17995),
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic & Live Patients'], ['Assistants', '1 Assistant']], 19490),
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic Only'], ['Assistants', 'None']], 3995),
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic Only'], ['Assistants', '1 Assistant']], 5490),
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic & Live Patients - MasterMind'], ['Assistants', 'None']], 14995),
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic & Live Patients - MasterMind'], ['Assistants', '1 Assistant']], 15990),
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic Only - MasterMind'], ['Assistants', 'None']], 995),
      makeCombo([['Registration', 'Apr 20-24 2026 - Didactic Only - MasterMind'], ['Assistants', '1 Assistant']], 1990),
    ],
  };

  it('derives doctorPrice (LP base)', () => {
    const prices = derivePrices(config, product);
    expect(prices.doctorPrice).toBe(17995);
  });

  it('derives didacticOnlyPrice', () => {
    const prices = derivePrices(config, product);
    expect(prices.didacticOnlyPrice).toBe(3995);
  });

  it('derives assistantPrice from DO delta', () => {
    const prices = derivePrices(config, product);
    expect(prices.assistantPrice).toBe(1495);
  });

  it('derives mastermindDiscount', () => {
    const prices = derivePrices(config, product);
    expect(prices.mastermindDiscount).toBe(3000);
  });

  it('derives assistantPriceMM from MasterMind delta', () => {
    const prices = derivePrices(config, product);
    expect(prices.assistantPriceMM).toBe(995);
  });

  it('skips MasterMind fields when hasMastermind is false', () => {
    const noMM = { type: 'assistants', hasMastermind: false };
    const prices = derivePrices(noMM, product);
    expect(prices.doctorPrice).toBe(17995);
    expect(prices.mastermindDiscount).toBeUndefined();
    expect(prices.assistantPriceMM).toBeUndefined();
  });
});

// ─── Simple course (like FM) ─────────────────────────────────────────────────

describe('derivePrices — simple', () => {
  it('uses product base price', () => {
    const config = { type: 'simple' };
    const product = { price: 12995, combinations: [] };
    const prices = derivePrices(config, product);
    expect(prices.doctorPrice).toBe(12995);
  });
});

// ─── Fallback / edge cases ───────────────────────────────────────────────────

describe('derivePrices — fallback', () => {
  it('returns empty object when combinations are missing', () => {
    const config = { type: 'teamMembers' };
    const product = { price: 2495 };
    const prices = derivePrices(config, product);
    expect(prices).toEqual({});
  });

  it('returns empty object when no matching combos found', () => {
    const config = { type: 'teamMembers' };
    const product = { price: 2495, combinations: [] };
    const prices = derivePrices(config, product);
    expect(prices).toEqual({});
  });

  it('returns empty object for unknown course type', () => {
    const config = { type: 'unknown' };
    const product = { price: 100, combinations: [] };
    const prices = derivePrices(config, product);
    expect(prices).toEqual({});
  });
});
