/**
 * DOM rendering — steppers, toggles, price breakdown, registration radios.
 * Reads registration options from Ecwid DOM, then replaces the native options
 * section with our custom UI.
 */
import { calculatePrice, isDidacticOnly, fmt } from './pricing.js';
import { addToCart } from './cart.js';

const PREFIX = 'td3';

// ─── State ────────────────────────────────────────────────────────────────────

function createState(config) {
  return {
    registration: '',
    doctors: 1,
    teamMembers: 0,
    assistants: 0,
    isMastermind: false,
    digitalAccess: false,
    config,
  };
}

// ─── Registration option parsing ──────────────────────────────────────────────

/**
 * Read registration options from the Ecwid DOM.
 * Returns array of { value, label, isLivePatient, isMastermind, isTeamOnly }
 */
export function parseRegistrationOptions(container) {
  if (!container) return [];
  const inputs = container.querySelectorAll('input[type="radio"]');
  return Array.from(inputs).map((input) => {
    const value = input.value;
    const isMM = / - mastermind$/i.test(value);
    const isTO = /^team only/i.test(value);
    const isLP = /live patients/i.test(value) || /didactic & live/i.test(value);
    return {
      value,
      label: value,
      isLivePatient: isLP,
      isMastermind: isMM,
      isTeamOnly: isTO,
    };
  });
}

/**
 * Filter registration options for display.
 * Hide MasterMind-suffixed and Team Only options (those are used internally for cart calls).
 * Team Only is handled by setting the Doctors stepper to 0.
 */
export function getVisibleOptions(allOptions) {
  return allOptions.filter((o) => !o.isMastermind && !o.isTeamOnly);
}

// ─── Inject styles ────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById(`${PREFIX}-styles`)) return;
  const style = document.createElement('style');
  style.id = `${PREFIX}-styles`;
  // Brand accent from 3D Dentists site
  const ACCENT = '#D4772C';
  const ACCENT_HOVER = '#bf6823';
  const DARK = '#1a1a1a';

  style.textContent = `
    /* ── Hide native Ecwid elements when widget is active ── */
    body.${PREFIX}-active .product-details__product-purchase,
    body.${PREFIX}-active .product-details__product-price-row,
    body.${PREFIX}-active .product-details__product-share,
    body.${PREFIX}-active .product-details-module__product-purchase,
    body.${PREFIX}-active .details-product-purchase {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
    }

    /* ── Widget container ── */
    .${PREFIX}-widget {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      max-width: 520px !important;
      color: ${DARK} !important;
      position: relative !important;
      z-index: 10 !important;
      background: #fff !important;
      padding: 24px !important;
      border-radius: 12px !important;
      box-sizing: border-box !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12) !important;
    }
    .${PREFIX}-widget *,
    .${PREFIX}-widget *::before,
    .${PREFIX}-widget *::after {
      box-sizing: border-box !important;
      font-family: inherit !important;
    }

    /* ── Section label ── */
    .${PREFIX}-section-label {
      font-size: 11px !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
      color: #888 !important;
      margin: 0 0 10px 0 !important;
      padding: 0 !important;
    }

    /* ── Registration radios ── */
    .${PREFIX}-reg-list {
      list-style: none !important;
      margin: 0 0 20px 0 !important;
      padding: 0 !important;
    }
    .${PREFIX}-reg-item {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 12px 14px !important;
      border: 2px solid #e5e7eb !important;
      border-radius: 10px !important;
      margin-bottom: 8px !important;
      cursor: pointer !important;
      transition: all 0.15s ease !important;
      background: #fff !important;
    }
    .${PREFIX}-reg-item:hover {
      border-color: #bbb !important;
      background: #fafafa !important;
    }
    .${PREFIX}-reg-item.${PREFIX}-selected {
      border-color: ${ACCENT} !important;
      background: #fef9f5 !important;
    }
    .${PREFIX}-reg-item input[type="radio"] {
      appearance: none !important;
      -webkit-appearance: none !important;
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      border: 2px solid #ccc !important;
      border-radius: 50% !important;
      margin: 0 10px 0 0 !important;
      padding: 0 !important;
      flex-shrink: 0 !important;
      position: relative !important;
      background: #fff !important;
      cursor: pointer !important;
    }
    .${PREFIX}-reg-item.${PREFIX}-selected input[type="radio"] {
      border-color: ${ACCENT} !important;
    }
    .${PREFIX}-reg-item.${PREFIX}-selected input[type="radio"]::after {
      content: '' !important;
      position: absolute !important;
      top: 3px !important;
      left: 3px !important;
      width: 8px !important;
      height: 8px !important;
      border-radius: 50% !important;
      background: ${ACCENT} !important;
    }
    .${PREFIX}-reg-left {
      display: flex !important;
      align-items: center !important;
      flex: 1 !important;
      min-width: 0 !important;
    }
    .${PREFIX}-reg-label {
      font-size: 13px !important;
      font-weight: 500 !important;
      color: ${DARK} !important;
      line-height: 1.3 !important;
    }
    .${PREFIX}-badge {
      font-size: 10px !important;
      font-weight: 700 !important;
      padding: 2px 7px !important;
      border-radius: 4px !important;
      white-space: nowrap !important;
      margin-left: 8px !important;
      flex-shrink: 0 !important;
      letter-spacing: 0.02em !important;
    }
    .${PREFIX}-badge-lp {
      background: #fef2f2 !important;
      color: #dc2626 !important;
    }
    .${PREFIX}-badge-to {
      background: #eff6ff !important;
      color: #2563eb !important;
    }

    /* ── MasterMind toggle ── */
    .${PREFIX}-mm-box {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 14px 16px !important;
      border: 2px solid #e5e7eb !important;
      border-radius: 10px !important;
      margin-bottom: 20px !important;
      background: #fffbf5 !important;
      gap: 12px !important;
    }
    .${PREFIX}-mm-left {
      flex: 1 !important;
      min-width: 0 !important;
    }
    .${PREFIX}-mm-label {
      font-weight: 700 !important;
      font-size: 14px !important;
      color: ${DARK} !important;
      line-height: 1.3 !important;
    }
    .${PREFIX}-mm-sub {
      font-size: 11px !important;
      color: #666 !important;
      margin-top: 3px !important;
      line-height: 1.3 !important;
    }
    /* Toggle switch */
    .${PREFIX}-toggle {
      position: relative !important;
      width: 48px !important;
      min-width: 48px !important;
      height: 26px !important;
      min-height: 26px !important;
      background: #d1d5db !important;
      border-radius: 13px !important;
      cursor: pointer !important;
      transition: background 0.2s ease !important;
      flex-shrink: 0 !important;
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      display: block !important;
    }
    .${PREFIX}-toggle.${PREFIX}-active {
      background: ${ACCENT} !important;
    }
    .${PREFIX}-toggle::after {
      content: '' !important;
      position: absolute !important;
      top: 3px !important;
      left: 3px !important;
      width: 20px !important;
      height: 20px !important;
      background: #fff !important;
      border-radius: 50% !important;
      transition: transform 0.2s ease !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
    }
    .${PREFIX}-toggle.${PREFIX}-active::after {
      transform: translateX(22px) !important;
    }

    /* ── Digital Access checkbox ── */
    .${PREFIX}-da-box {
      display: flex !important;
      align-items: center !important;
      padding: 14px 16px !important;
      border: 2px solid #e5e7eb !important;
      border-radius: 10px !important;
      margin-bottom: 20px !important;
      cursor: pointer !important;
      background: #fff !important;
      transition: border-color 0.15s ease !important;
    }
    .${PREFIX}-da-box:hover {
      border-color: #bbb !important;
    }
    .${PREFIX}-da-box input[type="checkbox"] {
      margin: 0 12px 0 0 !important;
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      flex-shrink: 0 !important;
      cursor: pointer !important;
      accent-color: ${ACCENT} !important;
    }
    .${PREFIX}-da-label {
      font-weight: 600 !important;
      font-size: 14px !important;
      color: ${DARK} !important;
    }
    .${PREFIX}-da-price {
      font-size: 12px !important;
      color: #888 !important;
      margin-left: 6px !important;
    }

    /* ── Stepper rows ── */
    .${PREFIX}-stepper-row {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      margin-bottom: 14px !important;
      padding: 0 !important;
    }
    .${PREFIX}-stepper-info {
      flex: 1 !important;
      min-width: 0 !important;
    }
    .${PREFIX}-stepper-name {
      font-weight: 700 !important;
      font-size: 14px !important;
      color: ${DARK} !important;
    }
    .${PREFIX}-stepper-cap {
      font-size: 11px !important;
      color: #dc2626 !important;
      font-weight: 600 !important;
      margin-left: 4px !important;
    }
    .${PREFIX}-stepper-rate {
      font-size: 12px !important;
      color: #888 !important;
      margin-top: 2px !important;
    }
    .${PREFIX}-stepper-ctrl {
      display: flex !important;
      align-items: center !important;
      border: 2px solid #e5e7eb !important;
      border-radius: 8px !important;
      overflow: hidden !important;
      background: #fff !important;
      flex-shrink: 0 !important;
    }
    .${PREFIX}-stepper-btn {
      width: 36px !important;
      height: 36px !important;
      border: none !important;
      background: #fff !important;
      font-size: 18px !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: ${DARK} !important;
      transition: background 0.1s ease !important;
      padding: 0 !important;
      line-height: 1 !important;
    }
    .${PREFIX}-stepper-btn:hover {
      background: #f3f4f6 !important;
    }
    .${PREFIX}-stepper-btn:disabled {
      color: #d1d5db !important;
      cursor: default !important;
      background: #fff !important;
    }
    .${PREFIX}-stepper-val {
      width: 50px !important;
      text-align: center !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      border-left: 1px solid #e5e7eb !important;
      border-right: 1px solid #e5e7eb !important;
      line-height: 36px !important;
      color: ${DARK} !important;
      background: #fff !important;
    }
    .${PREFIX}-stepper-val-team-only {
      font-size: 11px !important;
      font-weight: 500 !important;
      color: #888 !important;
    }

    /* ── Price breakdown ── */
    .${PREFIX}-breakdown {
      margin-top: 20px !important;
      padding-top: 16px !important;
      border-top: 2px solid #f0f0f0 !important;
    }
    .${PREFIX}-breakdown-line {
      display: flex !important;
      justify-content: space-between !important;
      font-size: 13px !important;
      margin-bottom: 6px !important;
      color: #555 !important;
    }
    .${PREFIX}-breakdown-line span {
      color: inherit !important;
    }
    .${PREFIX}-breakdown-line.${PREFIX}-savings,
    .${PREFIX}-breakdown-line.${PREFIX}-savings span {
      color: #16a34a !important;
      font-weight: 600 !important;
    }
    .${PREFIX}-total-row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: baseline !important;
      margin-top: 12px !important;
      padding-top: 12px !important;
      border-top: 1px solid #e5e7eb !important;
    }
    .${PREFIX}-total-label {
      font-weight: 700 !important;
      font-size: 16px !important;
      color: ${DARK} !important;
    }
    .${PREFIX}-total-amount {
      font-weight: 800 !important;
      font-size: 26px !important;
      color: ${DARK} !important;
    }

    /* ── Add to Cart button ── */
    .${PREFIX}-add-btn {
      display: block !important;
      width: 100% !important;
      padding: 15px !important;
      margin-top: 20px !important;
      border: none !important;
      border-radius: 10px !important;
      background: ${ACCENT} !important;
      color: #fff !important;
      font-size: 16px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      transition: background 0.15s ease !important;
      letter-spacing: 0.02em !important;
      text-transform: none !important;
    }
    .${PREFIX}-add-btn:hover {
      background: ${ACCENT_HOVER} !important;
    }
    .${PREFIX}-add-btn:disabled {
      background: #d1d5db !important;
      cursor: not-allowed !important;
      color: #fff !important;
    }
    .${PREFIX}-add-btn.${PREFIX}-checkout {
      background: #16a34a !important;
      cursor: pointer !important;
      color: #fff !important;
    }
    .${PREFIX}-add-btn.${PREFIX}-checkout:hover {
      background: #15803d !important;
    }

    /* ── Error message ── */
    .${PREFIX}-error {
      color: #dc2626 !important;
      font-size: 13px !important;
      margin-top: 8px !important;
      display: none !important;
    }
    .${PREFIX}-error.${PREFIX}-visible {
      display: block !important;
    }
  `;
  document.head.appendChild(style);
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Render the full custom widget, replacing Ecwid's native options.
 *
 * @param {HTMLElement} nativeContainer - Ecwid's .product-details__options element
 * @param {object} config - Entry from COURSE_CONFIG
 * @param {number} productId - Ecwid product ID
 * @param {Array} allRegistrationOptions - Parsed from DOM
 */
export function renderWidget(nativeContainer, config, productId, allRegistrationOptions) {
  injectStyles();

  // Hide native UI via both CSS class on body (persistent) and inline (immediate)
  nativeContainer.style.display = 'none';
  document.body.classList.add(`${PREFIX}-active`);
  // Also hide inline for immediate effect
  ['.product-details__product-purchase',
   '.product-details__product-price-row',
   '.product-details__product-share',
   '.product-details-module__product-purchase',
   '.details-product-purchase'
  ].forEach((sel) => {
    document.querySelectorAll(sel).forEach((e) => { e.style.display = 'none'; });
  });

  // Remove previous widget if re-rendering
  const prev = nativeContainer.parentElement.querySelector(`.${PREFIX}-widget`);
  if (prev) prev.remove();

  const widget = document.createElement('div');
  widget.className = `${PREFIX}-widget`;
  nativeContainer.parentElement.insertBefore(widget, nativeContainer.nextSibling);

  const state = createState(config);
  const visibleOptions = getVisibleOptions(allRegistrationOptions);
  let addedToCart = false;

  // Select first visible option by default
  if (visibleOptions.length > 0) {
    state.registration = visibleOptions[0].value;
  }

  /** Reset addedToCart and re-render (called when user changes any option) */
  function onOptionChange() {
    addedToCart = false;
    render();
  }

  function render() {
    widget.innerHTML = '';

    // Registration section
    const regSection = el('div');
    regSection.appendChild(label('Registration Date'));
    const regList = el('ul', `${PREFIX}-reg-list`);

    visibleOptions.forEach((opt) => {
      const item = el('li', `${PREFIX}-reg-item`);
      if (opt.value === state.registration) item.classList.add(`${PREFIX}-selected`);

      const left = el('div', `${PREFIX}-reg-left`);
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `${PREFIX}-reg`;
      radio.value = opt.value;
      radio.checked = opt.value === state.registration;
      left.appendChild(radio);

      const lbl = el('span', `${PREFIX}-reg-label`);
      lbl.textContent = opt.value;
      left.appendChild(lbl);
      item.appendChild(left);

      if (opt.isLivePatient) {
        const badge = el('span', `${PREFIX}-badge ${PREFIX}-badge-lp`);
        badge.textContent = 'Live Patients';
        item.appendChild(badge);
      }

      item.addEventListener('click', () => {
        state.registration = opt.value;
        // Reset mastermind if didactic only and not applicable
        if (isDidacticOnly(opt.value) && config.mastermindDoApplies === false) {
          state.isMastermind = false;
        }
        onOptionChange();
      });

      regList.appendChild(item);
    });
    regSection.appendChild(regList);
    widget.appendChild(regSection);

    const isDO = isDidacticOnly(state.registration);

    // MasterMind toggle (only for courses that have it, and not for didactic-only when excluded)
    const showMM = config.hasMastermind && !(isDO && config.mastermindDoApplies === false);
    if (showMM) {
      const mmBox = el('div', `${PREFIX}-mm-box`);
      const mmLeft = el('div', `${PREFIX}-mm-left`);
      const mmLabel = el('div', `${PREFIX}-mm-label`);
      mmLabel.textContent = 'MasterMind Member?';
      mmLeft.appendChild(mmLabel);
      const mmSub = el('div', `${PREFIX}-mm-sub`);
      mmSub.textContent = `Save $${fmt(config.mastermindDiscount)}/doctor · Assistants from $${fmt(config.assistantPriceMM)}`;
      mmLeft.appendChild(mmSub);
      mmBox.appendChild(mmLeft);

      const toggle = el('div', `${PREFIX}-toggle`);
      if (state.isMastermind) toggle.classList.add(`${PREFIX}-active`);
      toggle.addEventListener('click', () => {
        state.isMastermind = !state.isMastermind;
        onOptionChange();
      });
      mmBox.appendChild(toggle);
      widget.appendChild(mmBox);
    } else {
      state.isMastermind = false;
    }

    // Steppers section
    if (config.type === 'teamMembers') {
      // Doctor stepper — min 0 allows team-only mode
      const docRate = config.doctorPrice;
      widget.appendChild(
        stepper('Doctors', `$${fmt(docRate)}/doctor`, state.doctors, 0, 10, null, (v) => {
          state.doctors = v;
          // When doctors goes to 0, ensure at least 1 team member
          if (v === 0 && state.teamMembers === 0) state.teamMembers = 1;
          onOptionChange();
        })
      );

      // Team Members stepper — min 1 when doctors is 0 (team-only)
      const tmRate = config.teamMemberPrice;
      const tmMin = state.doctors === 0 ? 1 : 0;
      widget.appendChild(
        stepper('Team Members', `$${fmt(tmRate)}/person`, state.teamMembers, tmMin, config.maxTeamMembers, null, (v) => {
          state.teamMembers = v;
          onOptionChange();
        })
      );
    } else if (config.type === 'assistants') {
      // Doctor stepper
      const docRate = isDO ? config.didacticOnlyPrice : config.doctorPrice;
      const effectiveRate = state.isMastermind ? docRate - config.mastermindDiscount : docRate;
      widget.appendChild(
        stepper('Doctors', `$${fmt(effectiveRate)}/doctor`, state.doctors, 1, 10, null, (v) => {
          state.doctors = v;
          onOptionChange();
        })
      );

      // Assistants stepper
      const isLP = !isDO;
      const maxAsst = isLP && config.livePatientAssistantCap
        ? config.livePatientAssistantCap
        : config.maxAssistants;
      const capLabel = isLP && config.livePatientAssistantCap
        ? `max ${config.livePatientAssistantCap}`
        : null;
      const asstRate = state.isMastermind ? config.assistantPriceMM : config.assistantPrice;
      widget.appendChild(
        stepper('Assistants', `$${fmt(asstRate)}/person`, state.assistants, 0, maxAsst, capLabel, (v) => {
          state.assistants = v;
          onOptionChange();
        })
      );
    } else if (config.type === 'simple') {
      // Doctor stepper
      widget.appendChild(
        stepper('Doctors', `$${fmt(config.doctorPrice)}/doctor`, state.doctors, 1, 10, null, (v) => {
          state.doctors = v;
          onOptionChange();
        })
      );
    }

    // Digital Access checkbox (DGS only)
    if (config.hasDigitalAccess) {
      const daBox = el('div', `${PREFIX}-da-box`);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.digitalAccess;
      cb.addEventListener('change', () => {
        state.digitalAccess = cb.checked;
        onOptionChange();
      });
      daBox.appendChild(cb);
      const daLabel = el('span', `${PREFIX}-da-label`);
      daLabel.textContent = 'Digital Access';
      daBox.appendChild(daLabel);
      const daPrice = el('span', `${PREFIX}-da-price`);
      daPrice.textContent = '+$395';
      daBox.appendChild(daPrice);
      daBox.addEventListener('click', (e) => {
        if (e.target !== cb) {
          cb.checked = !cb.checked;
          state.digitalAccess = cb.checked;
          onOptionChange();
        }
      });
      widget.appendChild(daBox);
    }

    // Price breakdown
    const priceResult = calculatePrice(config, state);
    const bkd = el('div', `${PREFIX}-breakdown`);

    priceResult.breakdown.forEach((line) => {
      const row = el('div', `${PREFIX}-breakdown-line`);
      if (line.isSavings) row.classList.add(`${PREFIX}-savings`);
      const lbl = el('span');
      lbl.textContent = line.label;
      row.appendChild(lbl);
      const amt = el('span');
      amt.textContent = line.amount < 0 ? `-$${fmt(Math.abs(line.amount))}` : `$${fmt(line.amount)}`;
      row.appendChild(amt);
      bkd.appendChild(row);
    });

    const totalRow = el('div', `${PREFIX}-total-row`);
    const totalLabel = el('span', `${PREFIX}-total-label`);
    totalLabel.textContent = 'Total';
    totalRow.appendChild(totalLabel);
    const totalAmount = el('span', `${PREFIX}-total-amount`);
    totalAmount.textContent = `$${fmt(priceResult.total)}`;
    totalRow.appendChild(totalAmount);
    bkd.appendChild(totalRow);
    widget.appendChild(bkd);

    // Validation
    const isValid = validateOrder(config, state);

    // Error message
    const errorMsg = el('div', `${PREFIX}-error`);
    if (!isValid) {
      errorMsg.classList.add(`${PREFIX}-visible`);
      errorMsg.textContent = 'Please select at least one Doctor or Team Member ticket.';
    }
    widget.appendChild(errorMsg);

    // Add to Cart / Go To Checkout button
    const btn = document.createElement('button');
    btn.className = `${PREFIX}-add-btn`;
    if (addedToCart) {
      // Already added — show Go To Checkout
      btn.textContent = 'Go To Checkout →';
      btn.classList.add(`${PREFIX}-checkout`);
      btn.disabled = false;
      btn.addEventListener('click', () => {
        try {
          // eslint-disable-next-line no-undef
          Ecwid.openPage('cart');
        } catch (_e) {
          window.location.hash = '#!/~/cart';
        }
      });
    } else {
      btn.textContent = 'Add to Cart';
      btn.disabled = !isValid || !state.registration;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Adding...';
        addToCart(productId, config, state, allRegistrationOptions, (success) => {
          if (success) {
            addedToCart = true;
            render();
          } else {
            btn.textContent = 'Error — try again';
            btn.disabled = false;
          }
        });
      });
    }
    widget.appendChild(btn);
  }

  render();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function label(text) {
  const l = el('div', `${PREFIX}-section-label`);
  l.textContent = text;
  return l;
}

function stepper(name, rateText, value, min, max, capLabel, onChange) {
  const row = el('div', `${PREFIX}-stepper-row`);

  const info = el('div', `${PREFIX}-stepper-info`);
  const nameEl = el('span', `${PREFIX}-stepper-name`);
  nameEl.textContent = name;
  info.appendChild(nameEl);
  if (capLabel) {
    const cap = el('span', `${PREFIX}-stepper-cap`);
    cap.textContent = `(${capLabel})`;
    info.appendChild(cap);
  }
  const rate = el('div', `${PREFIX}-stepper-rate`);
  rate.textContent = rateText;
  info.appendChild(rate);
  row.appendChild(info);

  const ctrl = el('div', `${PREFIX}-stepper-ctrl`);

  const btnMinus = document.createElement('button');
  btnMinus.className = `${PREFIX}-stepper-btn`;
  btnMinus.textContent = '\u2212';
  btnMinus.disabled = value <= min;
  btnMinus.addEventListener('click', () => onChange(Math.max(min, value - 1)));
  ctrl.appendChild(btnMinus);

  const val = el('div', `${PREFIX}-stepper-val`);
  if (value === 0 && name === 'Doctors') {
    val.classList.add(`${PREFIX}-stepper-val-team-only`);
    val.textContent = 'None';
  } else if (value === 0) {
    val.textContent = 'None';
  } else {
    val.textContent = value;
  }
  ctrl.appendChild(val);

  const btnPlus = document.createElement('button');
  btnPlus.className = `${PREFIX}-stepper-btn`;
  btnPlus.textContent = '+';
  btnPlus.disabled = value >= max;
  btnPlus.addEventListener('click', () => onChange(Math.min(max, value + 1)));
  ctrl.appendChild(btnPlus);

  row.appendChild(ctrl);
  return row;
}

function validateOrder(config, state) {
  if (config.type === 'simple') return state.doctors >= 1;
  if (config.type === 'teamMembers') return state.doctors > 0 || state.teamMembers > 0;
  if (config.type === 'assistants') return state.doctors >= 1;
  return false;
}
