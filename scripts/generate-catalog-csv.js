#!/usr/bin/env node
/**
 * Generate the COMPLETE Ecwid catalog CSV for all 3D Dentists products.
 * This CSV is designed to be imported as a FULL replacement — it contains
 * every option, option value, and variation for every product.
 *
 * Run:  node scripts/generate-catalog-csv.js > ~/Downloads/ecwid_full_catalog.csv
 */

const STORE_ID = 131073255;

// ─── Product definitions ────────────────────────────────────────────────────
// Each product defines: id, sku, dates, options, pricing, and how to generate variations.

const PRODUCTS = {
  // ── TEAM MEMBER COURSES ──────────────────────────────────────────────────
  'DGS': {
    id: 817675365,
    sku: '3D-DGS-001',
    name: '3D Dentists Growth Summit',
    basePrice: 1995,
    dates: [
      { label: 'Apr 30 - May 1 2026 - Orlando FL', code: 'APR' },
    ],
    type: 'teamMembers',
    teamMemberPrice: 1295,
    maxTeamMembers: 20,
    hasDigitalAccess: true,
    digitalAccessPrice: 395,
    hasMastermind: false,
  },
  'SD': {
    id: 817672610,
    sku: '3D-SD-001',
    name: 'Smile Design',
    basePrice: 3495,
    dates: [
      { label: 'Aug 13-14 2026 - Nashville TN', code: 'AUG' },
    ],
    type: 'teamMembers',
    teamMemberPrice: 1995,
    maxTeamMembers: 5,
    hasMastermind: false,
  },
  'CAA': {
    id: 817677323,
    sku: '3D-CAA-001',
    name: 'CAA',
    basePrice: 3995,
    dates: [
      { label: 'Mar 19-20 2026 - Raleigh NC', code: 'MAR' },
      { label: 'Sep 17-18 2026 - Raleigh NC', code: 'SEP' },
    ],
    type: 'teamMembers',
    teamMemberPrice: 1495,
    maxTeamMembers: 5,
    hasMastermind: false,
  },
  'SAI': {
    id: 817677320,
    sku: '3D-SAI-001',
    name: 'SAI',
    basePrice: 2495,
    dates: [
      { label: 'Apr 16-17 2026 - Raleigh NC', code: 'APR' },
      { label: 'Nov 5-6 2026 - Raleigh NC', code: 'NOV' },
    ],
    type: 'teamMembers',
    teamMemberPrice: 1495,
    maxTeamMembers: 5,
    hasMastermind: false,
  },

  // ── ASSISTANT COURSES (with MasterMind) ──────────────────────────────────
  'AGS': {
    id: 817672612,
    sku: '3D-AGS-001',
    name: 'AGS',
    basePrice: 17995,    // Didactic & Live Patients
    doPrice: 5995,       // Didactic Only
    dates: [
      { label: 'Apr 20-24 2026', code: 'APR' },
    ],
    type: 'assistants',
    assistantPrice: 1495,
    assistantPriceMM: 995,
    maxAssistants: 5,
    lpAssistantCap: 2,
    hasMastermind: true,
    mmDiscount: 3000,
    mastermindDoApplies: true,
  },
  'FAE': {
    id: 817677321,
    sku: '3D-FAE-001',
    name: 'Full Arch Express',
    basePrice: 18995,
    doPrice: 5995,
    dates: [
      { label: 'Aug 3-7 2026', code: 'AUG' },
      { label: 'Oct 26-30 2026', code: 'OCT' },
    ],
    type: 'assistants',
    assistantPrice: 1495,
    assistantPriceMM: 995,
    maxAssistants: 5,
    lpAssistantCap: 2,
    hasMastermind: true,
    mmDiscount: 3000,
    mastermindDoApplies: true,
  },
  'TRT': {
    id: 817677322,
    sku: '3D-TRT-001',
    name: 'Tooth Replacement Therapy',
    basePrice: 17995,
    doPrice: 2995,
    dates: [
      { label: 'Jun 8-12 2026', code: 'JUN' },
      { label: 'Sep 14-18 2026', code: 'SEP' },
    ],
    type: 'assistants',
    assistantPrice: 1495,
    assistantPriceMM: 995,
    maxAssistants: 5,
    lpAssistantCap: 2,
    hasMastermind: true,
    mmDiscount: 3000,
    mastermindDoApplies: false,  // Didactic Only MasterMind discount excluded
  },
};

// ─── CSV column definitions ─────────────────────────────────────────────────
const HEADER = [
  'type','product_internal_id','product_sku','product_name','product_price',
  'product_compare_to_price','product_is_inventory_tracked','product_quantity',
  'product_quantity_out_of_stock_behaviour','product_low_stock_notification_quantity',
  'product_quantity_minimum_allowed_for_purchase','product_quantity_maximum_allowed_for_purchase',
  'product_is_available','product_media_main_image_url','product_media_main_image_alt',
  'product_description','product_category_1','product_is_featured',
  'product_is_featured_order_by','product_brand','product_upc','product_ribbon_text',
  'product_ribbon_color','product_subtitle','product_weight','product_is_shipping_required',
  'product_length','product_width','product_height',
  'product_shipping_preparation_time_for_shipping_in_days',
  'product_shipping_preparation_time_for_pickup_in_minutes',
  'product_shipping_preparation_time_for_local_delivery_in_minutes',
  'product_shipping_preparation_time_for_preorders_in_days',
  'product_shipping_show_delivery_date_on_the_product_page',
  'product_taxable','product_enabled_manual_taxes','product_tax_class_code',
  'product_seo_title','product_seo_description','product_related_item_ids',
  'product_related_item_skus','product_related_items_random',
  'product_related_items_random_category','product_related_items_random_number_of_items',
  'product_custom_price_enabled','product_google_product_category_code',
  'product_option_name','product_option_type','product_option_is_required',
  'product_option_value','product_option_markup','product_option_is_default_option_selection',
  'product_option_swatch_hex_value','product_option_swatch_image',
  'product_option_swatch_selector_is_image',
  'product_variation_option_Registration','product_variation_option_Assistants',
  'product_variation_option_Team Members','product_variation_sku',
  'category_internal_id','category_path','category_is_available',
  'category_description','category_seo_title','category_seo_description',
  'category_image','category_image_alt','category_order_by',
  'source_store_id','url','custom_url_slug',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyRow() {
  return new Array(HEADER.length).fill('');
}

function csvEscape(val) {
  if (val === undefined || val === null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function setCol(row, colName, value) {
  const idx = HEADER.indexOf(colName);
  if (idx === -1) throw new Error(`Unknown column: ${colName}`);
  row[idx] = value;
}

function makeOptionRow(productId, sku, optionName, optionType, isRequired, value, markup, isDefault) {
  const row = emptyRow();
  setCol(row, 'type', 'product_option');
  setCol(row, 'product_internal_id', productId);
  setCol(row, 'product_sku', sku);
  setCol(row, 'product_option_name', optionName);
  setCol(row, 'product_option_type', optionType);
  setCol(row, 'product_option_is_required', isRequired);
  setCol(row, 'product_option_value', value);
  setCol(row, 'product_option_markup', markup != null ? markup.toFixed(2) : '0.00');
  setCol(row, 'product_option_is_default_option_selection', isDefault);
  setCol(row, 'source_store_id', STORE_ID);
  return row;
}

function makeVariationRow(productId, sku, price, variationSku, regValue, assistantsValue, teamMembersValue) {
  const row = emptyRow();
  setCol(row, 'type', 'product_variation');
  setCol(row, 'product_internal_id', productId);
  setCol(row, 'product_sku', sku);
  setCol(row, 'product_price', price.toFixed(2));
  setCol(row, 'product_is_inventory_tracked', 'false');
  setCol(row, 'product_quantity', 0);
  setCol(row, 'product_quantity_out_of_stock_behaviour', 'SHOW');
  setCol(row, 'product_quantity_minimum_allowed_for_purchase', 1);
  setCol(row, 'product_variation_option_Registration', regValue);
  if (assistantsValue != null) setCol(row, 'product_variation_option_Assistants', assistantsValue);
  if (teamMembersValue != null) setCol(row, 'product_variation_option_Team Members', teamMembersValue);
  setCol(row, 'product_variation_sku', variationSku);
  setCol(row, 'source_store_id', STORE_ID);
  return row;
}

// ─── Generate rows for each product ─────────────────────────────────────────

const allRows = [];

for (const [key, p] of Object.entries(PRODUCTS)) {
  if (p.type === 'teamMembers') {
    // ── Registration option values ──
    for (let i = 0; i < p.dates.length; i++) {
      const d = p.dates[i];
      // Regular registration
      allRows.push(makeOptionRow(p.id, p.sku, 'Registration', 'RADIOBUTTONS', true,
        d.label, 0, i === 0 ? true : false));
      // Team Only registration
      allRows.push(makeOptionRow(p.id, p.sku, 'Registration', 'RADIOBUTTONS', true,
        `Team Only - ${d.label}`, 0, false));
    }

    // ── Team Members option values ──
    allRows.push(makeOptionRow(p.id, p.sku, 'Team Members', 'RADIOBUTTONS', true,
      'None', 0, true));
    for (let n = 1; n <= p.maxTeamMembers; n++) {
      const label = n === 1 ? '1 Team Member' : `${n} Team Members`;
      allRows.push(makeOptionRow(p.id, p.sku, 'Team Members', 'RADIOBUTTONS', true,
        label, 0, false));
    }

    // ── Digital Access option (DGS only) ──
    if (p.hasDigitalAccess) {
      allRows.push(makeOptionRow(p.id, p.sku, 'Digital Access', 'DROPDOWN', true,
        'No', 0, true));
      allRows.push(makeOptionRow(p.id, p.sku, 'Digital Access', 'DROPDOWN', true,
        'Yes', p.digitalAccessPrice, false));
    }

    // ── Variations: Registration × Team Members ──
    for (const d of p.dates) {
      // Regular registration: doctor ($basePrice) + TMs
      for (let n = 0; n <= p.maxTeamMembers; n++) {
        const tmLabel = n === 0 ? 'None' : (n === 1 ? '1 Team Member' : `${n} Team Members`);
        const price = p.basePrice + (n * p.teamMemberPrice);
        const varSku = `${p.sku}-${d.code}-D-TM${n}`;
        allRows.push(makeVariationRow(p.id, p.sku, price, varSku, d.label, null, tmLabel));
      }
      // Team Only registration: $0 doctor + TMs only
      for (let n = 0; n <= p.maxTeamMembers; n++) {
        const tmLabel = n === 0 ? 'None' : (n === 1 ? '1 Team Member' : `${n} Team Members`);
        const price = n * p.teamMemberPrice;
        const varSku = `${p.sku}-TO-${d.code}-TM${n}`;
        allRows.push(makeVariationRow(p.id, p.sku, price, varSku,
          `Team Only - ${d.label}`, null, tmLabel));
      }
    }
  } else if (p.type === 'assistants') {
    // ── Registration option values ──
    for (let i = 0; i < p.dates.length; i++) {
      const d = p.dates[i];
      // Didactic & Live Patients
      allRows.push(makeOptionRow(p.id, p.sku, 'Registration', 'RADIOBUTTONS', true,
        `${d.label} - Didactic & Live Patients`, 0, i === 0 ? true : false));
      // Didactic Only
      allRows.push(makeOptionRow(p.id, p.sku, 'Registration', 'RADIOBUTTONS', true,
        `${d.label} - Didactic Only`, 0, false));

      if (p.hasMastermind) {
        // MasterMind - Didactic & Live Patients
        allRows.push(makeOptionRow(p.id, p.sku, 'Registration', 'RADIOBUTTONS', true,
          `${d.label} - Didactic & Live Patients - MasterMind`, 0, false));
        // MasterMind - Didactic Only (only if mastermindDoApplies)
        if (p.mastermindDoApplies) {
          allRows.push(makeOptionRow(p.id, p.sku, 'Registration', 'RADIOBUTTONS', true,
            `${d.label} - Didactic Only - MasterMind`, 0, false));
        }
      }
    }

    // ── Assistants option values ──
    allRows.push(makeOptionRow(p.id, p.sku, 'Assistants', 'RADIOBUTTONS', true,
      'None', 0, true));
    for (let n = 1; n <= p.maxAssistants; n++) {
      const label = n === 1 ? '1 Assistant' : `${n} Assistants`;
      allRows.push(makeOptionRow(p.id, p.sku, 'Assistants', 'RADIOBUTTONS', true,
        label, 0, false));
    }

    // ── MasterMind Member? dropdown ──
    if (p.hasMastermind) {
      // NO price markup — pricing is handled via variation (Path B)
      allRows.push(makeOptionRow(p.id, p.sku, 'MasterMind Member?', 'DROPDOWN', true,
        'No', 0, true));
      allRows.push(makeOptionRow(p.id, p.sku, 'MasterMind Member?', 'DROPDOWN', true,
        'Yes', 0, false));
    }

    // ── Variations: Registration × Assistants ──
    for (const d of p.dates) {
      // Didactic & Live Patients (regular)
      for (let n = 0; n <= p.lpAssistantCap; n++) {
        const aLabel = n === 0 ? 'None' : (n === 1 ? '1 Assistant' : `${n} Assistants`);
        const price = p.basePrice + (n * p.assistantPrice);
        const varSku = `${p.sku}-${d.code}-DLP-A${n}`;
        allRows.push(makeVariationRow(p.id, p.sku, price, varSku,
          `${d.label} - Didactic & Live Patients`, aLabel, null));
      }

      // Didactic Only (regular)
      for (let n = 0; n <= p.maxAssistants; n++) {
        const aLabel = n === 0 ? 'None' : (n === 1 ? '1 Assistant' : `${n} Assistants`);
        const price = p.doPrice + (n * p.assistantPrice);
        const varSku = `${p.sku}-${d.code}-DO-A${n}`;
        allRows.push(makeVariationRow(p.id, p.sku, price, varSku,
          `${d.label} - Didactic Only`, aLabel, null));
      }

      if (p.hasMastermind) {
        // MasterMind - Didactic & Live Patients
        const mmDlpBase = p.basePrice - p.mmDiscount;
        for (let n = 0; n <= p.lpAssistantCap; n++) {
          const aLabel = n === 0 ? 'None' : (n === 1 ? '1 Assistant' : `${n} Assistants`);
          const price = mmDlpBase + (n * p.assistantPriceMM);
          const varSku = `${p.sku}-${d.code}-DLP-MM-A${n}`;
          allRows.push(makeVariationRow(p.id, p.sku, price, varSku,
            `${d.label} - Didactic & Live Patients - MasterMind`, aLabel, null));
        }

        // MasterMind - Didactic Only (only if mastermindDoApplies)
        if (p.mastermindDoApplies) {
          const mmDoBase = p.doPrice - p.mmDiscount;
          for (let n = 0; n <= p.maxAssistants; n++) {
            const aLabel = n === 0 ? 'None' : (n === 1 ? '1 Assistant' : `${n} Assistants`);
            const price = mmDoBase + (n * p.assistantPriceMM);
            const varSku = `${p.sku}-${d.code}-DO-MM-A${n}`;
            allRows.push(makeVariationRow(p.id, p.sku, price, varSku,
              `${d.label} - Didactic Only - MasterMind`, aLabel, null));
          }
        }
      }
    }
  }
}

// ─── Output CSV ─────────────────────────────────────────────────────────────
const lines = [HEADER.map(csvEscape).join(',')];
for (const row of allRows) {
  lines.push(row.map(csvEscape).join(','));
}
process.stdout.write(lines.join('\n') + '\n');

// Summary to stderr
const optionCount = allRows.filter(r => r[HEADER.indexOf('type')] === 'product_option').length;
const variationCount = allRows.filter(r => r[HEADER.indexOf('type')] === 'product_variation').length;
process.stderr.write(`\nGenerated ${allRows.length} rows (${optionCount} options, ${variationCount} variations)\n`);
for (const [key, p] of Object.entries(PRODUCTS)) {
  const pRows = allRows.filter(r => r[HEADER.indexOf('product_internal_id')] == p.id);
  const pOpts = pRows.filter(r => r[HEADER.indexOf('type')] === 'product_option').length;
  const pVars = pRows.filter(r => r[HEADER.indexOf('type')] === 'product_variation').length;
  process.stderr.write(`  ${key} (${p.sku}): ${pOpts} options, ${pVars} variations\n`);
}
