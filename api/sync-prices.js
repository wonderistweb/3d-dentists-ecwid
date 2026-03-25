/**
 * Vercel Serverless Function: Webflow CMS → Ecwid Pricing Sync
 *
 * Reads pricing data from Webflow CMS (Courses + Course Dates), recalculates
 * all Ecwid variation prices, and updates them via the Ecwid API.
 *
 * Required environment variables (set in Vercel dashboard):
 *   WEBFLOW_API_TOKEN  — Webflow API token with CMS read access
 *   ECWID_SECRET_TOKEN — Ecwid API token with read_catalog + update_catalog scope
 *   SYNC_SECRET        — Shared secret for authorizing sync requests
 *
 * Usage:
 *   POST /api/sync-prices
 *   Authorization: Bearer {SYNC_SECRET}
 *   Body: { "productId": "817675365" }   ← optional, omit to sync all
 *         { "dryRun": true }             ← optional, preview without updating
 *
 * Webflow webhook:
 *   POST /api/sync-prices?secret={SYNC_SECRET}
 *   Automatically triggered when CMS items are published in Webflow.
 *   Detects webhook payload and runs a full sync.
 */

const ECWID_STORE_ID = 131073255;
const WEBFLOW_COURSES_COLLECTION = '68cc79773452528c1dbceaa7';
const WEBFLOW_COURSE_DATES_COLLECTION = '68cc780b24442bd8b0c63f84';

// ── Course structure metadata (structural config that doesn't change with pricing) ──
const COURSE_META = {
  '817675365': { sku: '3D-DGS-001', type: 'teamMembers', hasDigitalAccess: true, hasMastermind: false, name: 'Growth Summit' },
  '817672610': { sku: '3D-SD-001',  type: 'teamMembers', hasDigitalAccess: false, hasMastermind: false, name: 'Smile Design' },
  '817677323': { sku: '3D-CAA-001', type: 'teamMembers', hasDigitalAccess: false, hasMastermind: false, name: 'Clear Aligner Activation' },
  '817677320': { sku: '3D-SAI-001', type: 'teamMembers', hasDigitalAccess: false, hasMastermind: false, name: 'Sleep Apnea Implementation' },
  '817672612': { sku: '3D-AGS-001', type: 'assistants',  hasMastermind: true, mastermindDoApplies: false, name: 'Advanced Grafting & Sinus' },
  '817677321': { sku: '3D-FAE-001', type: 'assistants',  hasMastermind: true, mastermindDoApplies: false, name: 'Full Arch Express' },
  '817677322': { sku: '3D-TRT-001', type: 'assistants',  hasMastermind: true, mastermindDoApplies: false, name: 'Tooth Replacement Therapy' },
};

// ── Date matching ────────────────────────────────────────────────────────────
// Ecwid Registration values have date prefixes like "Jun 8-12 2026", "Apr 30 - May 1 2026".
// We match them to Webflow's date-new ISO dates by comparing month abbreviation + start day + year.

const MONTH_ABBRS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Build a short prefix from an ISO date string that will appear at the start
 * of the corresponding Ecwid Registration value, e.g. "Jun 8" from "2026-06-08".
 */
function datePrefix(isoDate) {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (isNaN(d)) return null;
  return `${MONTH_ABBRS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Check if an Ecwid Registration value belongs to a specific course date.
 * Matches on month abbreviation + start day + year at the beginning of the value.
 */
function comboMatchesDate(registrationValue, isoDate) {
  if (!registrationValue || !isoDate) return false;
  const d = new Date(isoDate);
  if (isNaN(d)) return false;
  const prefix = datePrefix(isoDate);
  const year = d.getUTCFullYear().toString();
  // Registration value starts with date prefix and contains the year
  // Also handle "Team Only - {date}" prefix
  const regNorm = registrationValue.replace(/^Team Only - /, '');
  return regNorm.startsWith(prefix) && regNorm.includes(year);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePrice(str) {
  if (str == null) return null;
  const cleaned = String(str).replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseSavings(str) {
  if (!str) return null;
  const match = str.match(/([\d,]+)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ''));
}

function parseCount(str) {
  if (!str || str === 'None') return 0;
  const match = str.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function getOpt(combo, optionName) {
  if (!combo || !combo.options) return undefined;
  const opt = combo.options.find(o => o.name === optionName);
  return opt ? opt.value : undefined;
}

// ── Webflow API ──────────────────────────────────────────────────────────────

async function fetchWebflowItems(collectionId, token) {
  const items = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=${limit}&offset=${offset}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`Webflow API ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    items.push(...data.items);
    if (items.length >= (data.pagination?.total ?? items.length)) break;
    offset += limit;
  }
  return items;
}

// ── Ecwid API ────────────────────────────────────────────────────────────────

async function ecwidGet(path, token) {
  const url = `https://app.ecwid.com/api/v3/${ECWID_STORE_ID}${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Ecwid GET ${path} → ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function ecwidPut(path, body, token) {
  const url = `https://app.ecwid.com/api/v3/${ECWID_STORE_ID}${path}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Ecwid PUT ${path} → ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

// ── Build pricing map from Webflow CMS ───────────────────────────────────────

function buildPriceMap(courses, courseDates) {
  // Index courses by Webflow item ID
  const courseById = new Map();
  for (const c of courses) {
    courseById.set(c.id, c.fieldData);
  }

  // Group course dates by ecwid-product-id, join with parent course
  const priceMap = new Map(); // ecwidProductId → { doctorPrice, teamMemberPrice, ... }
  // Track sold-out dates per product: ecwidProductId → [{ isoDate, soldOut }]
  const soldOutMap = new Map(); // ecwidProductId → [{ isoDate, soldOut }]

  for (const cd of courseDates) {
    const fd = cd.fieldData;
    const ecwidId = fd['ecwid-product-id'];
    if (!ecwidId) continue; // skip non-Ecwid items

    const meta = COURSE_META[ecwidId];
    if (!meta) continue; // unknown product

    // Track sold-out status for this date
    if (!soldOutMap.has(ecwidId)) soldOutMap.set(ecwidId, []);
    soldOutMap.get(ecwidId).push({
      isoDate: fd['date-new'],
      soldOut: fd['sold-out'] === true,
    });

    // Skip pricing if already processed (multiple dates share one product)
    if (priceMap.has(ecwidId)) continue;

    // Get parent course data via reference
    const parentCourseId = fd.category;
    const parentCourse = parentCourseId ? courseById.get(parentCourseId) : null;

    const prices = {};

    if (meta.type === 'teamMembers') {
      // Doctor price from Course Date's online-only-cost
      prices.doctorPrice = parsePrice(fd['online-only-cost']);
      // Team member price from parent Course
      prices.teamMemberPrice = parentCourse ? parsePrice(parentCourse['team-member-price']) : null;
      // Digital Access price from parent Course
      if (meta.hasDigitalAccess && parentCourse) {
        prices.digitalAccessPrice = parsePrice(parentCourse['digital-access-price']);
      }
    } else if (meta.type === 'assistants') {
      // Base prices from Course Date
      prices.doctorPrice = parsePrice(fd['3-day-didactic-live-patient-cost']);
      prices.didacticOnlyPrice = parsePrice(fd['3-day-didactic-cost']);
      // Assistant prices from parent Course
      if (parentCourse) {
        prices.assistantPrice = parsePrice(parentCourse['team-member-price']);
        prices.assistantPriceMM = parsePrice(parentCourse['mastermind-savings---team-price']);
        prices.mmDiscount = parseSavings(parentCourse['mastermind-savings---save-text']);
      }
    }

    priceMap.set(ecwidId, prices);
  }

  return { priceMap, soldOutMap };
}

// ── Calculate expected price for a combination ───────────────────────────────

function calculateCombinationPrice(combo, prices, meta) {
  if (meta.type === 'teamMembers') {
    const reg = getOpt(combo, 'Registration');
    const tm = getOpt(combo, 'Team Members');
    const tmCount = parseCount(tm);

    if (!reg) return null;

    // Digital Access Only: $0 base, option markup handles pricing
    if (/^digital access only$/i.test(reg)) return 0;

    // Team Only: no doctor fee
    if (/^team only/i.test(reg)) return tmCount * prices.teamMemberPrice;

    // Regular: doctor + team members
    return prices.doctorPrice + tmCount * prices.teamMemberPrice;
  }

  if (meta.type === 'assistants') {
    const reg = getOpt(combo, 'Registration');
    const asst = getOpt(combo, 'Assistants');
    const asstCount = parseCount(asst);

    if (!reg) return null;

    const isMM = /- MasterMind$/.test(reg);
    const isDLP = /Didactic & Live Patients/.test(reg);

    if (isMM) {
      if (isDLP) {
        // MasterMind Live Patient: doctorPrice - discount + assistants at MM rate
        return (prices.doctorPrice - prices.mmDiscount) + asstCount * prices.assistantPriceMM;
      } else if (meta.mastermindDoApplies !== false) {
        // MasterMind Didactic Only (only when mastermindDoApplies is not false)
        return (prices.didacticOnlyPrice - prices.mmDiscount) + asstCount * prices.assistantPriceMM;
      } else {
        // mastermindDoApplies is false — DO-MM combos shouldn't exist,
        // but if they do, price them same as regular DO (no discount)
        return prices.didacticOnlyPrice + asstCount * prices.assistantPrice;
      }
    }

    // Standard (non-MasterMind)
    const base = isDLP ? prices.doctorPrice : prices.didacticOnlyPrice;
    return base + asstCount * prices.assistantPrice;
  }

  return null;
}

// ── Sync a single Ecwid product ──────────────────────────────────────────────

async function syncProduct(ecwidProductId, prices, meta, ecwidToken, dryRun, soldOutDates) {
  const log = [];
  const pid = ecwidProductId;

  // Validate we have all required prices
  const missing = [];
  if (meta.type === 'teamMembers') {
    if (prices.doctorPrice == null) missing.push('doctorPrice');
    if (prices.teamMemberPrice == null) missing.push('teamMemberPrice');
    if (meta.hasDigitalAccess && prices.digitalAccessPrice == null) missing.push('digitalAccessPrice');
  } else if (meta.type === 'assistants') {
    if (prices.doctorPrice == null) missing.push('doctorPrice');
    if (prices.didacticOnlyPrice == null) missing.push('didacticOnlyPrice');
    if (prices.assistantPrice == null) missing.push('assistantPrice');
    if (meta.hasMastermind) {
      if (prices.assistantPriceMM == null) missing.push('assistantPriceMM');
      if (prices.mmDiscount == null) missing.push('mmDiscount');
    }
  }
  if (missing.length > 0) {
    log.push(`SKIP ${meta.name}: missing prices: ${missing.join(', ')}`);
    return { productId: pid, name: meta.name, status: 'skipped', reason: `Missing: ${missing.join(', ')}`, log };
  }

  log.push(`Syncing ${meta.name} (${pid}) — ${meta.type}`);
  log.push(`  Prices from Webflow: ${JSON.stringify(prices)}`);

  // Fetch existing combinations
  const combos = await ecwidGet(`/products/${pid}/combinations`, ecwidToken);
  log.push(`  Found ${combos.length} combinations`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  let stockUpdated = 0;

  for (const combo of combos) {
    const reg = getOpt(combo, 'Registration');
    const comboUpdate = {};

    // ── Price sync ──
    const expectedPrice = calculateCombinationPrice(combo, prices, meta);
    if (expectedPrice == null) {
      log.push(`  ? combo ${combo.id}: could not calculate price (reg=${reg})`);
      continue;
    }

    const currentPrice = combo.price ?? combo.defaultDisplayedPrice;
    const priceDiff = Math.abs(currentPrice - expectedPrice);
    if (priceDiff >= 0.01) {
      comboUpdate.price = expectedPrice;
    }

    // ── Sold-out stock sync ──
    if (soldOutDates && soldOutDates.length > 0) {
      // Determine if this combo's date is sold out
      const matchingDate = soldOutDates.find(sd => sd.isoDate && comboMatchesDate(reg, sd.isoDate));
      // Digital Access Only has no date prefix — it's tied to the product, not a date
      const isDateless = /^digital access only$/i.test(reg);

      if (matchingDate && !isDateless) {
        const shouldBeOutOfStock = matchingDate.soldOut;
        const isCurrentlyUnlimited = combo.unlimited !== false;
        const currentQty = combo.quantity ?? 0;

        if (shouldBeOutOfStock && (isCurrentlyUnlimited || currentQty > 0)) {
          comboUpdate.unlimited = false;
          comboUpdate.quantity = 0;
          log.push(`  ⊘ combo ${combo.id}: SOLD OUT (${reg})`);
          stockUpdated++;
        } else if (!shouldBeOutOfStock && !isCurrentlyUnlimited && currentQty === 0) {
          comboUpdate.unlimited = true;
          comboUpdate.quantity = 0;
          log.push(`  ✓ combo ${combo.id}: back in stock (${reg})`);
          stockUpdated++;
        }
      }
    }

    // ── Apply updates ──
    if (Object.keys(comboUpdate).length === 0) {
      unchanged++;
      continue;
    }

    if (comboUpdate.price != null) {
      log.push(`  ~ combo ${combo.id}: $${currentPrice} → $${expectedPrice} (${reg} / ${getOpt(combo, 'Team Members') || getOpt(combo, 'Assistants')})`);
    }

    if (!dryRun) {
      try {
        await ecwidPut(`/products/${pid}/combinations/${combo.id}`, comboUpdate, ecwidToken);
        updated++;
      } catch (err) {
        log.push(`  ! ERROR updating combo ${combo.id}: ${err.message}`);
        errors++;
      }
    } else {
      updated++; // count as "would update" in dry run
    }
  }

  // Update Digital Access option markup if applicable
  if (meta.hasDigitalAccess && prices.digitalAccessPrice != null) {
    try {
      const product = await ecwidGet(`/products/${pid}`, ecwidToken);
      const daOption = product.options?.find(o => o.name === 'Digital Access');
      if (daOption) {
        const yesChoice = daOption.choices?.find(ch => ch.text === 'Yes');
        if (yesChoice && Math.abs((yesChoice.priceModifier || 0) - prices.digitalAccessPrice) >= 0.01) {
          log.push(`  ~ Digital Access markup: $${yesChoice.priceModifier || 0} → $${prices.digitalAccessPrice}`);
          if (!dryRun) {
            // Update just the Digital Access choice price modifier
            const updatedOptions = product.options.map(opt => {
              if (opt.name !== 'Digital Access') return opt;
              return {
                ...opt,
                choices: opt.choices.map(ch => {
                  if (ch.text !== 'Yes') return ch;
                  return { ...ch, priceModifier: prices.digitalAccessPrice };
                }),
              };
            });
            await ecwidPut(`/products/${pid}`, { options: updatedOptions }, ecwidToken);
            log.push(`  Digital Access markup updated`);
          }
        } else {
          log.push(`  Digital Access markup unchanged ($${yesChoice?.priceModifier || 0})`);
        }
      }
    } catch (err) {
      log.push(`  ! ERROR updating Digital Access: ${err.message}`);
      errors++;
    }
  }

  log.push(`  Result: ${updated} updated, ${unchanged} unchanged, ${stockUpdated} stock changes, ${errors} errors`);

  return {
    productId: pid,
    name: meta.name,
    status: errors > 0 ? 'partial' : 'ok',
    updated,
    unchanged,
    stockUpdated,
    errors,
    log,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Auth check — accept Bearer header, body secret, or query param secret (for webhooks)
  const syncSecret = process.env.SYNC_SECRET;
  if (!syncSecret) {
    return res.status(500).json({ error: 'SYNC_SECRET not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.replace(/^Bearer\s+/i, '');
  const querySecret = req.query?.secret;
  const bodySecret = req.body?.secret;

  if (providedSecret !== syncSecret && bodySecret !== syncSecret && querySecret !== syncSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Detect Webflow webhook payload
  const isWebhook = !!(req.body?.triggerType || req.body?._id);

  // Check required env vars
  const webflowToken = process.env.WEBFLOW_API_TOKEN;
  const ecwidToken = process.env.ECWID_SECRET_TOKEN;

  if (!webflowToken) return res.status(500).json({ error: 'WEBFLOW_API_TOKEN not configured' });
  if (!ecwidToken) return res.status(500).json({ error: 'ECWID_SECRET_TOKEN not configured' });

  // Parse request options (webhooks always sync all products, never dry run)
  const targetProductId = isWebhook ? null : (req.body?.productId || null);
  const dryRun = isWebhook ? false : (req.body?.dryRun === true);

  try {
    // 1. Fetch Webflow CMS data
    const [courses, courseDates] = await Promise.all([
      fetchWebflowItems(WEBFLOW_COURSES_COLLECTION, webflowToken),
      fetchWebflowItems(WEBFLOW_COURSE_DATES_COLLECTION, webflowToken),
    ]);

    // 2. Build price map and sold-out map from Webflow data
    const { priceMap, soldOutMap } = buildPriceMap(courses, courseDates);

    // 3. Determine which products to sync
    const productIds = targetProductId
      ? [targetProductId]
      : [...priceMap.keys()];

    // 4. Sync each product (pricing + sold-out stock)
    const results = [];
    for (const pid of productIds) {
      const meta = COURSE_META[pid];
      if (!meta) {
        results.push({ productId: pid, status: 'skipped', reason: 'Unknown product ID' });
        continue;
      }

      const prices = priceMap.get(pid);
      if (!prices) {
        results.push({ productId: pid, name: meta.name, status: 'skipped', reason: 'No Webflow data found' });
        continue;
      }

      const soldOutDates = soldOutMap.get(pid) || [];
      const result = await syncProduct(pid, prices, meta, ecwidToken, dryRun, soldOutDates);
      results.push(result);
    }

    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);
    const totalStock = results.reduce((sum, r) => sum + (r.stockUpdated || 0), 0);
    const totalErrors = results.reduce((sum, r) => sum + (r.errors || 0), 0);

    return res.status(200).json({
      success: true,
      dryRun,
      summary: `${totalUpdated} combinations ${dryRun ? 'would be ' : ''}updated, ${totalStock} stock changes, ${totalErrors} errors`,
      products: results,
    });
  } catch (err) {
    console.error('Sync error:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
