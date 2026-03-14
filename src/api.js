/**
 * Ecwid REST API integration — fetches product data and derives prices
 * from variation (combination) deltas at runtime.
 *
 * This eliminates the need to hardcode prices in config.js. The widget
 * always displays prices matching what Ecwid will actually charge.
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
  // Try the app-specific token first, then empty string (store-level public token)
  const attempts = [APP_ID, ''];
  for (const id of attempts) {
    try {
      const token = Ecwid.getAppPublicToken(id);
      if (token) {
        console.log('[3D-Dentists] Got public token via appId:', JSON.stringify(id));
        return token;
      }
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
 * Derive all price fields from the product's combinations (variations).
 *
 * For teamMembers courses:
 *   - doctorPrice: base variation price (regular date, "None" team members)
 *   - teamMemberPrice: delta from base to "1 Team Member" variation
 *   - digitalAccessPrice: from Digital Access option markup (if present)
 *
 * For assistants courses:
 *   - doctorPrice: Didactic & Live Patients base
 *   - didacticOnlyPrice: Didactic Only base
 *   - assistantPrice: delta from DO base to "1 Assistant"
 *   - mastermindDiscount: LP base minus MasterMind LP base
 *   - assistantPriceMM: delta from MasterMind base to "1 Assistant"
 *
 * For simple courses:
 *   - doctorPrice: product's base price
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
    return deriveAssistantPrices(config, product, combos);
  }

  return {};
}

function deriveTeamMemberPrices(config, product, combos) {
  // Find a regular registration (not "Team Only") with "None" team members
  const baseCombo = combos.find(
    (c) =>
      c.options &&
      c.options['Registration'] &&
      !c.options['Registration'].startsWith('Team Only') &&
      c.options['Team Members'] === 'None',
  );
  if (!baseCombo) return {};

  const doctorPrice = baseCombo.price;

  // Find the same registration with "1 Team Member"
  const oneTmCombo = combos.find(
    (c) =>
      c.options &&
      c.options['Registration'] === baseCombo.options['Registration'] &&
      c.options['Team Members'] === '1 Team Member',
  );

  const teamMemberPrice = oneTmCombo ? oneTmCombo.price - doctorPrice : undefined;

  // Digital Access price from option markup
  const result = { doctorPrice };
  if (teamMemberPrice != null) result.teamMemberPrice = teamMemberPrice;

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

function deriveAssistantPrices(config, product, combos) {
  // Didactic & Live Patients base (not MasterMind)
  const lpBase = combos.find(
    (c) =>
      c.options &&
      /Didactic & Live Patients$/.test(c.options['Registration']) &&
      c.options['Assistants'] === 'None',
  );

  // Didactic Only base (not MasterMind)
  const doBase = combos.find(
    (c) =>
      c.options &&
      /Didactic Only$/.test(c.options['Registration']) &&
      c.options['Assistants'] === 'None',
  );

  if (!lpBase || !doBase) return {};

  const doctorPrice = lpBase.price;
  const didacticOnlyPrice = doBase.price;

  // Assistant price from DO base → "1 Assistant" delta
  const doOneAsst = combos.find(
    (c) =>
      c.options &&
      c.options['Registration'] === doBase.options['Registration'] &&
      c.options['Assistants'] === '1 Assistant',
  );
  const assistantPrice = doOneAsst ? doOneAsst.price - didacticOnlyPrice : undefined;

  const result = { doctorPrice, didacticOnlyPrice };
  if (assistantPrice != null) result.assistantPrice = assistantPrice;

  // MasterMind pricing
  if (config.hasMastermind) {
    const mmLpBase = combos.find(
      (c) =>
        c.options &&
        /Didactic & Live Patients - MasterMind$/.test(c.options['Registration']) &&
        c.options['Assistants'] === 'None',
    );
    if (mmLpBase) {
      result.mastermindDiscount = doctorPrice - mmLpBase.price;

      const mmOneAsst = combos.find(
        (c) =>
          c.options &&
          c.options['Registration'] === mmLpBase.options['Registration'] &&
          c.options['Assistants'] === '1 Assistant',
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
 *
 * @param {number} productId - Ecwid product ID
 * @param {object} baseConfig - Course config from COURSE_CONFIG
 * @returns {Promise<object>} Derived price fields
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
      console.log('[3D-Dentists] Fetched live prices for product', productId, prices);
      return prices;
    }

    console.warn('[3D-Dentists] Could not derive prices from API, using config defaults');
    return {};
  } catch (e) {
    console.warn('[3D-Dentists] API fetch failed, using config prices:', e.message);
    return {};
  }
}
