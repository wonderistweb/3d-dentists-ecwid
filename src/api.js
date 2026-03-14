/**
 * Ecwid REST API integration — fetches product data and derives prices
 * from variation (combination) deltas at runtime.
 *
 * This eliminates the need to hardcode prices in config.js. The widget
 * always displays prices matching what Ecwid will actually charge.
 *
 * Ecwid API combination shape:
 *   { options: [ { name: "Registration", value: "..." }, { name: "Team Members", value: "None" } ],
 *     price: 2495, sku: "...", ... }
 *
 * Ecwid API product.options shape:
 *   [ { name: "Digital Access", type: "SELECT", choices: [ { text: "Yes", priceModifier: 395 } ] } ]
 */

const STORE_ID = 131073255;
const APP_ID = 'custom-app-131073255-1';

/** In-memory cache keyed by productId — survives SPA navigation. */
const priceCache = new Map();

/**
 * Get the public storefront token for API access.
 * Public tokens are non-secret (read-only access to public product data).
 */
function getPublicToken() {
  const attempts = [APP_ID, ''];
  for (const id of attempts) {
    try {
      const token = Ecwid.getAppPublicToken(id);
      if (token) return token;
    } catch (_e) { /* try next */ }
  }
  return null;
}

/**
 * Fetch a product's data from the Ecwid REST API.
 * Uses Bearer header auth (required for modern Ecwid API).
 */
async function fetchProduct(productId, token) {
  const url = `https://app.ecwid.com/api/v3/${STORE_ID}/products/${productId}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

/**
 * Extract an option value from a combination's options array.
 * Ecwid returns options as: [{ name: "Registration", value: "..." }, ...]
 */
function getOpt(combo, optionName) {
  if (!combo || !combo.options) return undefined;
  const opt = combo.options.find((o) => o.name === optionName);
  return opt ? opt.value : undefined;
}

/**
 * Derive all price fields from the product's combinations (variations).
 *
 * @param {object} config - Base course config (type, flags, caps)
 * @param {object} product - Ecwid API product response
 * @returns {object} Derived price fields to merge into config
 */
export function derivePrices(config, product) {
  const combos = product.combinations || [];

  if (config.type === 'simple') {
    return { doctorPrice: product.price };
  }

  if (config.type === 'teamMembers') {
    return deriveTeamMemberPrices(config, product, combos);
  }

  if (config.type === 'assistants') {
    return deriveAssistantPrices(config, combos);
  }

  return {};
}

function deriveTeamMemberPrices(config, product, combos) {
  // Find a regular registration (not "Team Only") with "None" team members
  const baseCombo = combos.find((c) => {
    const reg = getOpt(c, 'Registration');
    const tm = getOpt(c, 'Team Members');
    return reg && !reg.startsWith('Team Only') && tm === 'None';
  });
  if (!baseCombo) return {};

  const doctorPrice = baseCombo.price;
  const baseReg = getOpt(baseCombo, 'Registration');

  // Find the same registration with "1 Team Member"
  const oneTmCombo = combos.find((c) =>
    getOpt(c, 'Registration') === baseReg && getOpt(c, 'Team Members') === '1 Team Member',
  );

  const result = { doctorPrice };
  if (oneTmCombo) result.teamMemberPrice = oneTmCombo.price - doctorPrice;

  // Digital Access price from product-level option markup
  if (config.hasDigitalAccess && product.options) {
    const daOption = product.options.find((o) => o.name === 'Digital Access');
    if (daOption && daOption.choices) {
      const yesChoice = daOption.choices.find((ch) => ch.text === 'Yes');
      if (yesChoice && yesChoice.priceModifier != null) {
        result.digitalAccessPrice = yesChoice.priceModifier;
      }
    }
  }

  return result;
}

function deriveAssistantPrices(config, combos) {
  // Didactic & Live Patients base (not MasterMind)
  const lpBase = combos.find((c) => {
    const reg = getOpt(c, 'Registration');
    return reg && /Didactic & Live Patients$/.test(reg) && getOpt(c, 'Assistants') === 'None';
  });

  // Didactic Only base (not MasterMind)
  const doBase = combos.find((c) => {
    const reg = getOpt(c, 'Registration');
    return reg && /Didactic Only$/.test(reg) && getOpt(c, 'Assistants') === 'None';
  });

  if (!lpBase || !doBase) return {};

  const doctorPrice = lpBase.price;
  const didacticOnlyPrice = doBase.price;
  const doReg = getOpt(doBase, 'Registration');

  // Assistant price from DO base → "1 Assistant" delta
  const doOneAsst = combos.find((c) =>
    getOpt(c, 'Registration') === doReg && getOpt(c, 'Assistants') === '1 Assistant',
  );

  const result = { doctorPrice, didacticOnlyPrice };
  if (doOneAsst) result.assistantPrice = doOneAsst.price - didacticOnlyPrice;

  // MasterMind pricing
  if (config.hasMastermind) {
    const lpReg = getOpt(lpBase, 'Registration');
    const mmLpBase = combos.find((c) => {
      const reg = getOpt(c, 'Registration');
      return reg && /Didactic & Live Patients - MasterMind$/.test(reg) && getOpt(c, 'Assistants') === 'None';
    });
    if (mmLpBase) {
      result.mastermindDiscount = doctorPrice - mmLpBase.price;
      const mmReg = getOpt(mmLpBase, 'Registration');

      const mmOneAsst = combos.find((c) =>
        getOpt(c, 'Registration') === mmReg && getOpt(c, 'Assistants') === '1 Assistant',
      );
      if (mmOneAsst) {
        result.assistantPriceMM = mmOneAsst.price - mmLpBase.price;
      }
    }
  }

  return result;
}

/**
 * Fetch product prices, derive them from variations, and cache the result.
 * Falls back to an empty object on failure (config.js defaults will be used).
 */
export async function fetchProductPrices(productId, baseConfig) {
  if (priceCache.has(productId)) return priceCache.get(productId);

  try {
    const token = getPublicToken();
    if (!token) {
      console.warn('[3D-Dentists] No public token available, using config prices');
      return {};
    }

    const product = await fetchProduct(productId, token);
    const prices = derivePrices(baseConfig, product);

    if (Object.keys(prices).length > 0) {
      priceCache.set(productId, prices);
      console.log('[3D-Dentists] Live prices for product', productId, prices);
      return prices;
    }

    console.warn('[3D-Dentists] Could not derive prices from API, using config defaults');
    return {};
  } catch (e) {
    console.warn('[3D-Dentists] API fetch failed, using config prices:', e.message);
    return {};
  }
}
