/**
 * Vercel Cron: Clean up past course dates
 *
 * Runs daily at 6:00 AM ET. For each Webflow Course Date whose Starting Date
 * has passed, this endpoint:
 *   1. Deletes the matching Ecwid product combinations (Registration option
 *      values containing that date). Past orders are NOT affected — Ecwid
 *      stores option values as text snapshots on each order.
 *   2. Archives the Webflow CMS item so it no longer appears on the site.
 *
 * Also removes the Registration option value itself from the Ecwid product
 * so expired dates can't be selected.
 *
 * Required environment variables:
 *   WEBFLOW_API_TOKEN  — Webflow API token with CMS write access
 *   ECWID_SECRET_TOKEN — Ecwid API token with read_catalog + update_catalog scope
 *   CRON_SECRET        — Vercel cron secret for authorization
 */

const ECWID_STORE_ID = 131073255;
const WEBFLOW_COURSE_DATES_COLLECTION = '68cc780b24442bd8b0c63f84';

const MONTH_ABBRS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function comboMatchesDate(registrationValue, isoDate) {
  if (!registrationValue || !isoDate) return false;
  const d = new Date(isoDate);
  if (isNaN(d)) return false;
  const prefix = `${MONTH_ABBRS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const year = d.getUTCFullYear().toString();
  const regNorm = registrationValue.replace(/^Team Only - /, '');
  return regNorm.startsWith(prefix) && regNorm.includes(year);
}

function getOpt(combo, name) {
  const opt = combo.options?.find(o => o.name === name);
  return opt ? opt.value : undefined;
}

// ── API wrappers ─────────────────────────────────────────────────────────────

async function fetchWebflowItems(collectionId, token) {
  const items = [];
  let offset = 0;
  while (true) {
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100&offset=${offset}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`Webflow ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    items.push(...data.items);
    if (items.length >= (data.pagination?.total ?? items.length)) break;
    offset += 100;
  }
  return items;
}

async function ecwidGet(path, token) {
  const resp = await fetch(`https://app.ecwid.com/api/v3/${ECWID_STORE_ID}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Ecwid GET ${path} → ${resp.status}`);
  return resp.json();
}

async function ecwidPut(path, body, token) {
  const resp = await fetch(`https://app.ecwid.com/api/v3/${ECWID_STORE_ID}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`Ecwid PUT ${path} → ${resp.status}`);
  return resp.json();
}

async function ecwidDelete(path, token) {
  const resp = await fetch(`https://app.ecwid.com/api/v3/${ECWID_STORE_ID}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Ecwid DELETE ${path} → ${resp.status}`);
  return resp.json();
}

/**
 * Unpublish a Webflow CMS item from the live site.
 * Uses DELETE /collections/{id}/items/live which removes from the live site
 * and sets isDraft: true, preserving the item in the CMS for historical reference.
 */
async function unpublishWebflowItem(collectionId, itemId, token) {
  const resp = await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items/live`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: itemId }] }),
  });
  if (!resp.ok) throw new Error(`Webflow unpublish ${itemId} → ${resp.status}: ${await resp.text()}`);
  // Returns 204 No Content on success
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Vercel cron sends GET requests with Authorization header
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: Vercel cron uses CRON_SECRET, manual calls use SYNC_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const syncSecret = process.env.SYNC_SECRET;
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  const querySecret = req.query?.secret;

  const isAuthorized =
    (cronSecret && bearerToken === cronSecret) ||
    (syncSecret && bearerToken === syncSecret) ||
    (syncSecret && querySecret === syncSecret);

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const webflowToken = process.env.WEBFLOW_API_TOKEN;
  const ecwidToken = process.env.ECWID_SECRET_TOKEN;
  if (!webflowToken || !ecwidToken) {
    return res.status(500).json({ error: 'Missing required env vars' });
  }

  // Allow dry run via query param
  const dryRun = req.query?.dryRun === 'true' || req.body?.dryRun === true;
  const now = new Date();

  try {
    const courseDates = await fetchWebflowItems(WEBFLOW_COURSE_DATES_COLLECTION, webflowToken);
    const log = [];
    let totalDeleted = 0;
    let totalArchived = 0;

    // Find expired course dates (Starting Date in the past, has Ecwid product, not already archived)
    const expired = courseDates.filter(cd => {
      const startDate = cd.fieldData['date-new'];
      if (!startDate || cd.isArchived || cd.isDraft) return false;
      return new Date(startDate) < now;
    });

    log.push(`Found ${expired.length} expired course date(s) out of ${courseDates.length} total`);

    // Group expired dates by Ecwid product ID
    const byProduct = new Map();
    for (const cd of expired) {
      const ecwidId = cd.fieldData['ecwid-product-id'];
      if (!ecwidId) {
        log.push(`  Skip "${cd.fieldData.name}" — no Ecwid product ID`);
        continue;
      }
      if (!byProduct.has(ecwidId)) byProduct.set(ecwidId, []);
      byProduct.get(ecwidId).push(cd);
    }

    for (const [ecwidId, dates] of byProduct) {
      log.push(`\nProduct ${ecwidId}:`);

      // Check if ALL dates for this product are expired
      const allDatesForProduct = courseDates.filter(
        cd => cd.fieldData['ecwid-product-id'] === ecwidId && cd.fieldData['date-new']
      );
      const allExpired = allDatesForProduct.every(cd => new Date(cd.fieldData['date-new']) < now);

      // Fetch combos
      const combos = await ecwidGet(`/products/${ecwidId}/combinations`, ecwidToken);

      for (const cd of dates) {
        const isoDate = cd.fieldData['date-new'];
        const name = cd.fieldData.name;

        // Find matching combos
        const matching = combos.filter(c => {
          const reg = getOpt(c, 'Registration');
          return comboMatchesDate(reg, isoDate);
        });

        log.push(`  "${name}" (${isoDate.slice(0, 10)}): ${matching.length} combo(s) to delete`);

        // Delete matching combinations
        for (const combo of matching) {
          const reg = getOpt(combo, 'Registration');
          log.push(`    DELETE combo ${combo.id}: ${reg} / ${getOpt(combo, 'Team Members') || getOpt(combo, 'Assistants') || ''}`);
          if (!dryRun) {
            try {
              await ecwidDelete(`/products/${ecwidId}/combinations/${combo.id}`, ecwidToken);
              totalDeleted++;
            } catch (err) {
              log.push(`    ! ERROR: ${err.message}`);
            }
          } else {
            totalDeleted++;
          }
        }

        // Remove expired date values from the Registration option choices
        if (matching.length > 0 && !dryRun) {
          try {
            const product = await ecwidGet(`/products/${ecwidId}`, ecwidToken);
            const regOption = product.options?.find(o => o.name === 'Registration');
            if (regOption) {
              const expiredValues = new Set(matching.map(c => getOpt(c, 'Registration')));
              const filteredChoices = regOption.choices.filter(ch => !expiredValues.has(ch.text));
              if (filteredChoices.length < regOption.choices.length) {
                const updatedOptions = product.options.map(opt => {
                  if (opt.name !== 'Registration') return opt;
                  return { ...opt, choices: filteredChoices };
                });
                await ecwidPut(`/products/${ecwidId}`, { options: updatedOptions }, ecwidToken);
                log.push(`    Removed ${regOption.choices.length - filteredChoices.length} Registration option value(s)`);
              }
            }
          } catch (err) {
            log.push(`    ! ERROR removing option values: ${err.message}`);
          }
        }

        // Archive the Webflow CMS item
        log.push(`    Unpublish Webflow item ${cd.id}`);
        if (!dryRun) {
          try {
            await unpublishWebflowItem(WEBFLOW_COURSE_DATES_COLLECTION, cd.id, webflowToken);
            totalArchived++;
          } catch (err) {
            log.push(`    ! ERROR archiving: ${err.message}`);
          }
        } else {
          totalArchived++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      dryRun,
      summary: `${totalDeleted} combo(s) ${dryRun ? 'would be ' : ''}deleted, ${totalArchived} item(s) ${dryRun ? 'would be ' : ''}unpublished`,
      log,
    });
  } catch (err) {
    console.error('Cleanup error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
