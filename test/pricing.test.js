import { describe, it, expect } from 'vitest';
import {
  calcTeamMemberPrice,
  calcAssistantPrice,
  calcSimplePrice,
  calculatePrice,
  isDidacticOnly,
  isTeamOnly,
  fmt,
} from '../src/pricing.js';
import { COURSE_CONFIG } from '../src/config.js';

// ─── Helper detection ─────────────────────────────────────────────────────────

describe('isDidacticOnly', () => {
  it('detects "Didactic Only" in registration value', () => {
    expect(isDidacticOnly('Aug 3-7 2026 - Didactic Only - MasterMind')).toBe(true);
    expect(isDidacticOnly('Aug 3-7 2026 - Didactic Only')).toBe(true);
    expect(isDidacticOnly('Aug 3-7 2026 - Didactic & Live Patients')).toBe(false);
    expect(isDidacticOnly('Jun 8-12 2026 - Didactic & Live Patients - MasterMind')).toBe(false);
  });
});

describe('isTeamOnly', () => {
  it('detects "Team Only" at start of value', () => {
    expect(isTeamOnly('Team Only - Apr 30 - May 1 2026 - Orlando FL')).toBe(true);
    expect(isTeamOnly('Apr 30 - May 1 2026 - Orlando FL')).toBe(false);
  });
});

// ─── Team Member courses ──────────────────────────────────────────────────────

describe('calcTeamMemberPrice', () => {
  const dgs = COURSE_CONFIG['3D-DGS-001'];
  const sd = COURSE_CONFIG['3D-SD-001'];

  it('1 doctor, 0 team members', () => {
    const result = calcTeamMemberPrice(dgs, 1, 0);
    expect(result.total).toBe(2495);
    expect(result.breakdown).toHaveLength(1);
  });

  it('1 doctor, 3 team members', () => {
    const result = calcTeamMemberPrice(dgs, 1, 3);
    expect(result.total).toBe(2495 + 3 * 1295);
    expect(result.breakdown).toHaveLength(2);
  });

  it('0 doctors, 5 team members (team only)', () => {
    const result = calcTeamMemberPrice(dgs, 0, 5);
    expect(result.total).toBe(5 * 1295);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].label).toContain('Team Members');
  });

  it('3 doctors, 2 team members', () => {
    const result = calcTeamMemberPrice(sd, 3, 2);
    expect(result.total).toBe(3 * 3495 + 2 * 1995);
  });

  it('digital access add-on (DGS)', () => {
    const result = calcTeamMemberPrice(dgs, 1, 0, { digitalAccess: true });
    expect(result.total).toBe(2495 + 395);
    expect(result.breakdown).toHaveLength(2);
    expect(result.breakdown[1].label).toBe('Digital Access');
  });

  it('digital access ignored for non-DGS', () => {
    const result = calcTeamMemberPrice(sd, 1, 0, { digitalAccess: true });
    expect(result.total).toBe(3495); // no +395
  });
});

// ─── Assistant courses ────────────────────────────────────────────────────────

describe('calcAssistantPrice', () => {
  const ags = COURSE_CONFIG['3D-AGS-001'];
  const trt = COURSE_CONFIG['3D-TRT-001'];

  it('1 doctor, live patients, no MM', () => {
    const result = calcAssistantPrice(ags, 1, 0, { isDidacticOnly: false });
    expect(result.total).toBe(17995);
  });

  it('1 doctor, 2 assistants, live patients, no MM', () => {
    const result = calcAssistantPrice(ags, 1, 2, { isDidacticOnly: false });
    expect(result.total).toBe(17995 + 2 * 1495);
  });

  it('1 doctor, didactic only, no MM', () => {
    const result = calcAssistantPrice(ags, 1, 0, { isDidacticOnly: true });
    expect(result.total).toBe(5995);
  });

  it('1 doctor, live patients, MasterMind', () => {
    const result = calcAssistantPrice(ags, 1, 0, { isMastermind: true, isDidacticOnly: false });
    expect(result.total).toBe(17995 - 3000);
    expect(result.breakdown).toHaveLength(2); // base + savings line
    expect(result.breakdown[1].isSavings).toBe(true);
  });

  it('2 doctors, 1 assistant, MasterMind (discount per doctor)', () => {
    const result = calcAssistantPrice(ags, 2, 1, { isMastermind: true, isDidacticOnly: false });
    const expectedDoctors = 2 * (17995 - 3000);
    const expectedAsst = 1 * 995;
    expect(result.total).toBe(expectedDoctors + expectedAsst);
  });

  it('MasterMind assistant rate used when MM is on', () => {
    const result = calcAssistantPrice(ags, 1, 3, { isMastermind: true, isDidacticOnly: false });
    expect(result.total).toBe((17995 - 3000) + 3 * 995);
  });

  it('didactic only + MasterMind applies for AGS', () => {
    const result = calcAssistantPrice(ags, 1, 0, { isMastermind: true, isDidacticOnly: true });
    // AGS has no mastermindDoApplies flag (defaults to true)
    expect(result.total).toBe(5995 - 3000);
  });

  it('TRT didactic only + MasterMind does NOT apply', () => {
    const result = calcAssistantPrice(trt, 1, 0, { isMastermind: true, isDidacticOnly: true });
    // mastermindDoApplies: false for TRT → discount excluded
    expect(result.total).toBe(2995);
  });

  it('TRT live patients + MasterMind applies normally', () => {
    const result = calcAssistantPrice(trt, 1, 2, { isMastermind: true, isDidacticOnly: false });
    expect(result.total).toBe((17995 - 3000) + 2 * 995);
  });
});

// ─── Simple courses ───────────────────────────────────────────────────────────

describe('calcSimplePrice', () => {
  const fm = COURSE_CONFIG['3D-FM-001'];

  it('1 doctor', () => {
    const result = calcSimplePrice(fm, 1);
    expect(result.total).toBe(12995);
  });

  it('3 doctors', () => {
    const result = calcSimplePrice(fm, 3);
    expect(result.total).toBe(3 * 12995);
  });
});

// ─── Main dispatcher ──────────────────────────────────────────────────────────

describe('calculatePrice', () => {
  it('dispatches team member course', () => {
    const result = calculatePrice(COURSE_CONFIG['3D-DGS-001'], {
      doctors: 2,
      teamMembers: 3,
      registration: 'Apr 30 - May 1 2026 - Orlando FL',
    });
    expect(result.total).toBe(2 * 2495 + 3 * 1295);
  });

  it('dispatches assistant course with MasterMind', () => {
    const result = calculatePrice(COURSE_CONFIG['3D-FAE-001'], {
      doctors: 1,
      assistants: 2,
      isMastermind: true,
      registration: 'Aug 3-7 2026 - Didactic & Live Patients',
    });
    expect(result.total).toBe((18995 - 3000) + 2 * 995);
  });

  it('dispatches assistant course with didactic only registration', () => {
    const result = calculatePrice(COURSE_CONFIG['3D-AGS-001'], {
      doctors: 1,
      assistants: 1,
      registration: 'Apr 20-24 2026 - Didactic Only',
    });
    expect(result.total).toBe(5995 + 1495);
  });

  it('dispatches simple course', () => {
    const result = calculatePrice(COURSE_CONFIG['3D-FM-001'], {
      doctors: 1,
      registration: 'Some date',
    });
    expect(result.total).toBe(12995);
  });
});

// ─── Formatting ───────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('formats numbers with commas', () => {
    expect(fmt(17995)).toBe('17,995');
    expect(fmt(1295)).toBe('1,295');
    expect(fmt(395)).toBe('395');
    expect(fmt(0)).toBe('0');
  });
});
