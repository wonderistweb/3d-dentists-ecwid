/**
 * Ecwid.Cart.addProduct wrapper + multi-doctor logic.
 *
 * Cart strategy:
 *   - 1 doctor:  single addProduct call
 *   - N doctors: two addProduct calls (first with full options, second with
 *                quantity = N-1 and no assistants/team members)
 *
 * MasterMind (Path B):
 *   When MasterMind is toggled, append " - MasterMind" to the registration
 *   value. The MM-priced variation rows in Ecwid handle pricing. Do NOT pass
 *   the "MasterMind Member?" option — pricing is baked into the variation.
 */
import { isTeamOnly } from './pricing.js';

/**
 * Build the Registration value to pass to Ecwid.
 * If MasterMind is active, appends " - MasterMind".
 */
function getCartRegistration(state) {
  if (state.isMastermind) {
    return state.registration + ' - MasterMind';
  }
  return state.registration;
}

/**
 * Build the Team Members / Assistants option value string for Ecwid.
 * Ecwid expects values like "3 Team Members" or "2 Assistants".
 */
function getAddOnOptionValue(config, count) {
  if (count === 0) return 'None';
  if (config.type === 'teamMembers') {
    return count === 1 ? '1 Team Member' : `${count} Team Members`;
  }
  if (config.type === 'assistants') {
    return count === 1 ? '1 Assistant' : `${count} Assistants`;
  }
  return 'None';
}

/**
 * Wrap Ecwid.Cart.addProduct in a Promise.
 */
function ecwidAddProduct(params) {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line no-undef
      Ecwid.Cart.addProduct(params, function (success) {
        resolve(success);
      });
    } catch (e) {
      console.error('[3D-Dentists] Cart add error:', e);
      resolve(false);
    }
  });
}

/**
 * Add the configured product to cart.
 *
 * @param {number} productId - Ecwid product ID
 * @param {object} config - COURSE_CONFIG entry
 * @param {object} state - Current UI state
 * @param {Array} allOptions - All parsed registration options (including hidden MM ones)
 * @param {function} callback - Called with (success: boolean)
 */
export async function addToCart(productId, config, state, allOptions, callback) {
  try {
    const registration = getCartRegistration(state);
    const doctors = state.doctors;

    if (config.type === 'simple') {
      // Simple: just registration + quantity
      const success = await ecwidAddProduct({
        id: productId,
        quantity: doctors,
        options: { Registration: registration },
      });
      callback(success);
      return;
    }

    // Determine add-on count and option name
    const addOnCount = config.type === 'teamMembers' ? state.teamMembers : state.assistants;
    const addOnValue = getAddOnOptionValue(config, addOnCount);

    // Handle team-only mode (0 doctors)
    if (config.type === 'teamMembers' && doctors === 0) {
      // Team-only: use "Team Only - [date]" registration, team member count option
      const toRegistration = state.registration; // already a "Team Only - ..." value
      const success = await ecwidAddProduct({
        id: productId,
        quantity: 1,
        options: {
          Registration: toRegistration,
        },
      });
      callback(success);
      return;
    }

    if (doctors === 1) {
      // Standard single-doctor case
      const options = { Registration: registration };
      if (config.type === 'teamMembers') {
        options['Team Members'] = addOnValue;
      } else if (config.type === 'assistants') {
        options['Assistants'] = addOnValue;
      }
      if (config.hasDigitalAccess && state.digitalAccess) {
        options['Digital Access'] = 'Yes';
      }

      const success = await ecwidAddProduct({
        id: productId,
        quantity: 1,
        options,
      });
      callback(success);
    } else {
      // Multi-doctor: two calls
      // First call: 1 doctor + all add-ons
      const firstOptions = { Registration: registration };
      if (config.type === 'teamMembers') {
        firstOptions['Team Members'] = addOnValue;
      } else if (config.type === 'assistants') {
        firstOptions['Assistants'] = addOnValue;
      }
      if (config.hasDigitalAccess && state.digitalAccess) {
        firstOptions['Digital Access'] = 'Yes';
      }

      const first = await ecwidAddProduct({
        id: productId,
        quantity: 1,
        options: firstOptions,
      });

      if (!first) {
        callback(false);
        return;
      }

      // Second call: remaining doctors, no add-ons
      const secondOptions = { Registration: registration };
      if (config.type === 'teamMembers') {
        secondOptions['Team Members'] = 'None';
      } else if (config.type === 'assistants') {
        secondOptions['Assistants'] = 'None';
      }

      const second = await ecwidAddProduct({
        id: productId,
        quantity: doctors - 1,
        options: secondOptions,
      });

      callback(second);
    }
  } catch (e) {
    console.error('[3D-Dentists] addToCart error:', e);
    callback(false);
  }
}
