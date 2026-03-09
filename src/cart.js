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
 *   value. The MM-priced variation rows in Ecwid handle pricing.
 *   ALSO pass "MasterMind Member?" option since Ecwid requires all options
 *   to be set. Similarly, always pass "Digital Access" when the course has it.
 */
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
 * Attach required global options (MasterMind Member?, Digital Access)
 * that Ecwid mandates on every addProduct call.
 */
function attachRequiredOptions(options, config, state) {
  if (config.hasMastermind) {
    options['MasterMind Member?'] = state.isMastermind ? 'Yes' : 'No';
  }
  if (config.hasDigitalAccess) {
    options['Digital Access'] = state.digitalAccess ? 'Yes' : 'No';
  }
  return options;
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
      const options = attachRequiredOptions({ Registration: registration }, config, state);
      const success = await ecwidAddProduct({
        id: productId,
        quantity: doctors,
        options,
      });
      callback(success);
      return;
    }

    // Determine add-on count and option name
    const addOnCount = config.type === 'teamMembers' ? state.teamMembers : state.assistants;
    const addOnValue = getAddOnOptionValue(config, addOnCount);

    // Handle team-only mode (0 doctors)
    if (config.type === 'teamMembers' && doctors === 0) {
      // Team-only: prepend "Team Only - " to the regular date for the Ecwid variation
      const toRegistration = 'Team Only - ' + state.registration;
      const options = {
        Registration: toRegistration,
        'Team Members': addOnValue,
      };
      attachRequiredOptions(options, config, state);
      const success = await ecwidAddProduct({
        id: productId,
        quantity: 1,
        options,
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
      attachRequiredOptions(options, config, state);

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
      attachRequiredOptions(firstOptions, config, state);

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
      attachRequiredOptions(secondOptions, config, state);

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
