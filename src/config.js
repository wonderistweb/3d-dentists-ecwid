/**
 * COURSE_CONFIG — The sole place hardcoded course knowledge lives.
 *
 * To add a new course:
 *   1. Add a new entry keyed by SKU
 *   2. Set type to "teamMembers", "assistants", or "simple"
 *   3. Fill in pricing and caps
 *   4. No other code changes needed
 *
 * Dates are NEVER hardcoded here — they are read from the Ecwid DOM at runtime.
 */
export const COURSE_CONFIG = {
  // ── TEAM MEMBER courses ─────────────────────────────────────────────
  // Price per team member is baked into Ecwid variations.
  // doctorPrice = base product price (1 doctor ticket)
  // teamMemberPrice = per-TM add-on price (derived from variation deltas)

  '3D-DGS-001': {
    type: 'teamMembers',
    doctorPrice: 1995,
    teamMemberPrice: 1295,
    maxTeamMembers: 20,
    hasMastermind: false,
    hasLivePatient: false,
    hasDigitalAccess: true, // Digital Access checkbox add-on ($395)
  },

  '3D-SD-001': {
    type: 'teamMembers',
    doctorPrice: 3495,
    teamMemberPrice: 1995,
    maxTeamMembers: 5,
    hasMastermind: false,
    hasLivePatient: false,
  },

  '3D-CAA-001': {
    type: 'teamMembers',
    doctorPrice: 3995,
    teamMemberPrice: 1495,
    maxTeamMembers: 5,
    hasMastermind: false,
    hasLivePatient: false,
  },

  '3D-SAI-001': {
    type: 'teamMembers',
    doctorPrice: 2495,
    teamMemberPrice: 1495,
    maxTeamMembers: 5,
    hasMastermind: false,
    hasLivePatient: false,
  },

  // ── ASSISTANT courses ───────────────────────────────────────────────
  // Didactic Only = separate registration value with different base price.
  // Live Patient tracks cap assistants at livePatientAssistantCap.

  '3D-AGS-001': {
    type: 'assistants',
    doctorPrice: 17995,          // Didactic & Live Patients base
    didacticOnlyPrice: 5995,     // Didactic Only base
    assistantPrice: 1495,        // standard per-assistant rate
    assistantPriceMM: 995,       // MasterMind rate
    maxAssistants: 5,
    livePatientAssistantCap: 2,  // APO enforces; JS mirrors
    hasMastermind: true,
    mastermindDiscount: 3000,    // per-doctor flat discount
  },

  '3D-FAE-001': {
    type: 'assistants',
    doctorPrice: 18995,
    didacticOnlyPrice: 5995,
    assistantPrice: 1495,
    assistantPriceMM: 995,
    maxAssistants: 5,
    livePatientAssistantCap: 2,
    hasMastermind: true,
    mastermindDiscount: 3000,
  },

  '3D-TRT-001': {
    type: 'assistants',
    doctorPrice: 17995,
    didacticOnlyPrice: 2995,
    assistantPrice: 1495,
    assistantPriceMM: 995,
    hasMastermind: true,
    mastermindDiscount: 3000,
    // MasterMind applies to Live Patient track only.
    // Didactic Only base ($2,995) is below the $3,000 discount — excluded.
    mastermindDoApplies: false,
    maxAssistants: 5,
    livePatientAssistantCap: 2,
  },

  // ── SIMPLE (no add-ons) ─────────────────────────────────────────────
  '3D-FM-001': {
    type: 'simple',              // Registration only, no team members/assistants
    doctorPrice: 12995,
    hasMastermind: false,
  },
};
