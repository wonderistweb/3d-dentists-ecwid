/**
 * Pure pricing calculation functions.
 * No DOM or Ecwid dependencies — fully testable.
 */

/**
 * Detect whether a registration value is "Didactic Only" (no live patients).
 */
export function isDidacticOnly(registrationValue) {
  return /didactic only/i.test(registrationValue);
}

/**
 * Detect whether a registration value is a "Team Only" variant (0 doctors).
 */
export function isTeamOnly(registrationValue) {
  return /^team only/i.test(registrationValue);
}

/**
 * Calculate total price for a team-member course (DGS, SD, CAA, SAI).
 *
 * @param {object} config - Course config from COURSE_CONFIG
 * @param {number} doctors - Number of doctor tickets (0 = team-only)
 * @param {number} teamMembers - Number of team member tickets
 * @param {object} [opts] - Extra options
 * @param {boolean} [opts.digitalAccess] - Include Digital Access add-on (DGS only)
 * @returns {object} { total, breakdown[] }
 */
export function calcTeamMemberPrice(config, doctors, teamMembers, opts = {}) {
  const breakdown = [];
  let total = 0;

  if (doctors > 0) {
    const doctorSubtotal = doctors * config.doctorPrice;
    total += doctorSubtotal;
    breakdown.push({
      label: doctors === 1
        ? `1 Doctor × $${fmt(config.doctorPrice)}`
        : `${doctors} Doctors × $${fmt(config.doctorPrice)}`,
      amount: doctorSubtotal,
    });
  }

  if (teamMembers > 0) {
    const tmSubtotal = teamMembers * config.teamMemberPrice;
    total += tmSubtotal;
    breakdown.push({
      label: teamMembers === 1
        ? `1 Team Member × $${fmt(config.teamMemberPrice)}`
        : `${teamMembers} Team Members × $${fmt(config.teamMemberPrice)}`,
      amount: tmSubtotal,
    });
  }

  if (opts.digitalAccess && config.hasDigitalAccess && config.digitalAccessPrice) {
    total += config.digitalAccessPrice;
    breakdown.push({ label: 'Digital Access', amount: config.digitalAccessPrice });
  }

  return { total, breakdown };
}

/**
 * Calculate total price for an assistant course (AGS, FAE, TRT).
 *
 * @param {object} config - Course config from COURSE_CONFIG
 * @param {number} doctors - Number of doctor tickets
 * @param {number} assistants - Number of assistant tickets
 * @param {object} [opts]
 * @param {boolean} [opts.isMastermind] - MasterMind member pricing
 * @param {boolean} [opts.isDidacticOnly] - Didactic Only track selected
 * @returns {object} { total, breakdown[] }
 */
export function calcAssistantPrice(config, doctors, assistants, opts = {}) {
  const { isMastermind = false, isDidacticOnly: didacticOnly = false } = opts;
  const breakdown = [];
  let total = 0;

  // Determine if MasterMind discount actually applies
  const mmApplies = isMastermind
    && config.hasMastermind
    && !(didacticOnly && config.mastermindDoApplies === false);

  // Effective doctor price
  let effectiveDoctorPrice;
  if (didacticOnly) {
    effectiveDoctorPrice = mmApplies
      ? config.didacticOnlyPrice - config.mastermindDiscount
      : config.didacticOnlyPrice;
  } else {
    effectiveDoctorPrice = mmApplies
      ? config.doctorPrice - config.mastermindDiscount
      : config.doctorPrice;
  }

  if (doctors > 0) {
    const baseLabel = didacticOnly ? 'Didactic Only' : 'Didactic & Live Patients';
    const basePriceForLabel = didacticOnly ? config.didacticOnlyPrice : config.doctorPrice;
    const doctorSubtotal = doctors * effectiveDoctorPrice;
    total += doctorSubtotal;

    if (mmApplies) {
      breakdown.push({
        label: doctors === 1
          ? `1 Doctor × $${fmt(basePriceForLabel)}`
          : `${doctors} Doctors × $${fmt(basePriceForLabel)}`,
        amount: doctors * basePriceForLabel,
      });
      breakdown.push({
        label: `MasterMind saves: -$${fmt(config.mastermindDiscount)} per doctor`,
        amount: -(doctors * config.mastermindDiscount),
        isSavings: true,
      });
    } else {
      breakdown.push({
        label: doctors === 1
          ? `1 Doctor × $${fmt(effectiveDoctorPrice)}`
          : `${doctors} Doctors × $${fmt(effectiveDoctorPrice)}`,
        amount: doctorSubtotal,
      });
    }
  }

  if (assistants > 0) {
    const asstPrice = mmApplies ? config.assistantPriceMM : config.assistantPrice;
    const asstSubtotal = assistants * asstPrice;
    total += asstSubtotal;
    const rateLabel = mmApplies ? ` ($${fmt(asstPrice)} each, MasterMind rate)` : ` ($${fmt(asstPrice)} each)`;
    breakdown.push({
      label: assistants === 1
        ? `1 Assistant${rateLabel}`
        : `${assistants} Assistants${rateLabel}`,
      amount: asstSubtotal,
    });
  }

  return { total, breakdown };
}

/**
 * Calculate total price for a simple course (registration only).
 */
export function calcSimplePrice(config, doctors) {
  const total = doctors * config.doctorPrice;
  const breakdown = [{
    label: doctors === 1
      ? `1 Doctor × $${fmt(config.doctorPrice)}`
      : `${doctors} Doctors × $${fmt(config.doctorPrice)}`,
    amount: total,
  }];
  return { total, breakdown };
}

/**
 * Main pricing dispatcher.
 */
export function calculatePrice(config, state) {
  const { doctors, teamMembers = 0, assistants = 0, isMastermind = false, digitalAccess = false, registration = '' } = state;
  const didacticOnly = isDidacticOnly(registration);

  switch (config.type) {
    case 'teamMembers':
      return calcTeamMemberPrice(config, doctors, teamMembers, { digitalAccess });
    case 'assistants':
      return calcAssistantPrice(config, doctors, assistants, { isMastermind, isDidacticOnly: didacticOnly });
    case 'simple':
      return calcSimplePrice(config, doctors);
    default:
      return { total: 0, breakdown: [] };
  }
}

/**
 * Format a number with comma thousands separators.
 */
export function fmt(n) {
  return n.toLocaleString('en-US');
}
