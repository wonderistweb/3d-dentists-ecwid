/**
 * DOM rendering — steppers, toggles, price breakdown, registration radios.
 * Reads registration options from Ecwid DOM, then replaces the native options
 * section with our custom UI.
 */
import { calculatePrice, isDidacticOnly, isTeamOnly, fmt } from './pricing.js';
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
 * Hide MasterMind-suffixed options (those are used internally for cart calls).
 */
export function getVisibleOptions(allOptions) {
  return allOptions.filter((o) => !o.isMastermind);
}

// ─── Inject styles ────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById(`${PREFIX}-styles`)) return;
  const style = document.createElement('style');
  style.id = `${PREFIX}-styles`;
  style.textContent = `
    .${PREFIX}-widget {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      max-width: 520px !important;
      color: #1a1a1a !important;
      position: relative !important;
      z-index: 10 !important;
      background: #fff !important;
      padding: 24px !important;
      border-radius: 12px !important;
      box-sizing: border-box !important;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08) !important;
    }
    .${PREFIX}-widget * {
      color: inherit;
      font-family: inherit;
      box-sizing: border-box;
    }
    .${PREFIX}-section-label {
      font-size: 11px !important;
      font-weight: 600 !important;
      letter-spacing: 0.05em !important;
      text-transform: uppercase !important;
      color: #666 !important;
      margin-bottom: 8px !important;
    }
    /* Registration radios */
    .${PREFIX}-reg-list {
      list-style: none;
      margin: 0 0 16px;
      padding: 0;
    }
    .${PREFIX}-reg-item {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 12px 16px !important;
      border: 1px solid #e0e0e0 !important;
      border-radius: 8px !important;
      margin-bottom: 6px !important;
      cursor: pointer !important;
      transition: border-color 0.15s, background 0.15s !important;
      background: #fff !important;
    }
    .${PREFIX}-reg-item:hover {
      border-color: #999 !important;
    }
    .${PREFIX}-reg-item.${PREFIX}-selected {
      border-color: #1a1a1a !important;
      background: #fafafa !important;
    }
    .${PREFIX}-reg-item input[type="radio"] {
      appearance: none;
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border: 2px solid #ccc;
      border-radius: 50%;
      margin-right: 12px;
      flex-shrink: 0;
      position: relative;
    }
    .${PREFIX}-reg-item.${PREFIX}-selected input[type="radio"] {
      border-color: #1a1a1a;
    }
    .${PREFIX}-reg-item.${PREFIX}-selected input[type="radio"]::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #1a1a1a;
    }
    .${PREFIX}-reg-left {
      display: flex;
      align-items: center;
      flex: 1;
    }
    .${PREFIX}-reg-label {
      font-size: 14px !important;
      font-weight: 500 !important;
      color: #1a1a1a !important;
    }
    .${PREFIX}-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      margin-left: 8px;
    }
    .${PREFIX}-badge-lp {
      background: #ffeaea;
      color: #c0392b;
    }
    .${PREFIX}-badge-to {
      background: #e8f4fd;
      color: #2980b9;
    }
    /* MasterMind toggle */
    .${PREFIX}-mm-box {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 14px 16px !important;
      border: 1px solid #e0e0e0 !important;
      border-radius: 8px !important;
      margin-bottom: 16px !important;
      background: #fff !important;
    }
    .${PREFIX}-mm-label {
      font-weight: 600 !important;
      font-size: 14px !important;
      color: #1a1a1a !important;
    }
    .${PREFIX}-mm-sub {
      font-size: 12px !important;
      color: #666 !important;
      margin-top: 2px !important;
    }
    .${PREFIX}-toggle {
      position: relative;
      width: 44px;
      height: 24px;
      background: #ccc;
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    .${PREFIX}-toggle.${PREFIX}-active {
      background: #1a1a1a;
    }
    .${PREFIX}-toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    .${PREFIX}-toggle.${PREFIX}-active::after {
      transform: translateX(20px);
    }
    /* Digital Access checkbox */
    .${PREFIX}-da-box {
      display: flex !important;
      align-items: center !important;
      padding: 14px 16px !important;
      border: 1px solid #e0e0e0 !important;
      border-radius: 8px !important;
      margin-bottom: 16px !important;
      cursor: pointer !important;
      background: #fff !important;
    }
    .${PREFIX}-da-box input[type="checkbox"] {
      margin-right: 12px !important;
      width: 18px !important;
      height: 18px !important;
    }
    .${PREFIX}-da-label {
      font-weight: 600 !important;
      font-size: 14px !important;
      color: #1a1a1a !important;
    }
    .${PREFIX}-da-price {
      font-size: 12px !important;
      color: #666 !important;
      margin-left: 8px !important;
    }
    /* Stepper rows */
    .${PREFIX}-stepper-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .${PREFIX}-stepper-info {}
    .${PREFIX}-stepper-name {
      font-weight: 600 !important;
      font-size: 14px !important;
      color: #1a1a1a !important;
    }
    .${PREFIX}-stepper-cap {
      font-size: 12px !important;
      color: #c0392b !important;
      font-weight: 500 !important;
      margin-left: 6px !important;
    }
    .${PREFIX}-stepper-rate {
      font-size: 12px !important;
      color: #666 !important;
      margin-top: 2px !important;
    }
    .${PREFIX}-stepper-ctrl {
      display: flex !important;
      align-items: center !important;
      border: 1px solid #e0e0e0 !important;
      border-radius: 8px !important;
      overflow: hidden !important;
      background: #fff !important;
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
      color: #333 !important;
      transition: background 0.1s !important;
    }
    .${PREFIX}-stepper-btn:hover {
      background: #f5f5f5 !important;
    }
    .${PREFIX}-stepper-btn:disabled {
      color: #ccc !important;
      cursor: default !important;
      background: #fff !important;
    }
    .${PREFIX}-stepper-val {
      width: 48px !important;
      text-align: center !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      border-left: 1px solid #e0e0e0 !important;
      border-right: 1px solid #e0e0e0 !important;
      line-height: 36px !important;
      color: #1a1a1a !important;
      background: #fff !important;
    }
    .${PREFIX}-stepper-val-team-only {
      font-size: 11px;
      font-weight: 500;
      color: #666;
    }
    /* Price breakdown */
    .${PREFIX}-breakdown {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
    }
    .${PREFIX}-breakdown-line {
      display: flex !important;
      justify-content: space-between !important;
      font-size: 13px !important;
      margin-bottom: 4px !important;
      color: #444 !important;
    }
    .${PREFIX}-breakdown-line span {
      color: #444 !important;
    }
    .${PREFIX}-breakdown-line.${PREFIX}-savings,
    .${PREFIX}-breakdown-line.${PREFIX}-savings span {
      color: #27ae60 !important;
    }
    .${PREFIX}-total-row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: baseline !important;
      margin-top: 8px !important;
      padding-top: 8px !important;
    }
    .${PREFIX}-total-label {
      font-weight: 600 !important;
      font-size: 14px !important;
      color: #1a1a1a !important;
    }
    .${PREFIX}-total-amount {
      font-weight: 700 !important;
      font-size: 24px !important;
      color: #1a1a1a !important;
    }
    /* Add to Cart button */
    .${PREFIX}-add-btn {
      display: block !important;
      width: 100% !important;
      padding: 14px !important;
      margin-top: 16px !important;
      border: none !important;
      border-radius: 8px !important;
      background: #1a1a1a !important;
      color: #fff !important;
      font-size: 16px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: background 0.15s !important;
    }
    .${PREFIX}-add-btn:hover {
      background: #333 !important;
    }
    .${PREFIX}-add-btn:disabled {
      background: #999 !important;
      cursor: not-allowed !important;
    }
    /* Error message */
    .${PREFIX}-error {
      color: #c0392b;
      font-size: 13px;
      margin-top: 8px;
      display: none;
    }
    .${PREFIX}-error.${PREFIX}-visible {
      display: block;
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

  // Hide native UI: options, buy/purchase section, price, and share
  nativeContainer.style.display = 'none';
  const nativePurchase = document.querySelector('.product-details__product-purchase');
  if (nativePurchase) nativePurchase.style.display = 'none';
  const nativePrice = document.querySelector('.product-details__product-price-row');
  if (nativePrice) nativePrice.style.display = 'none';
  const nativeShare = document.querySelector('.product-details__product-share');
  if (nativeShare) nativeShare.style.display = 'none';

  // Remove previous widget if re-rendering
  const prev = nativeContainer.parentElement.querySelector(`.${PREFIX}-widget`);
  if (prev) prev.remove();

  const widget = document.createElement('div');
  widget.className = `${PREFIX}-widget`;
  nativeContainer.parentElement.insertBefore(widget, nativeContainer.nextSibling);

  const state = createState(config);
  const visibleOptions = getVisibleOptions(allRegistrationOptions);

  // Select first visible option by default
  if (visibleOptions.length > 0) {
    state.registration = visibleOptions[0].value;
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
      if (opt.isTeamOnly) {
        const badge = el('span', `${PREFIX}-badge ${PREFIX}-badge-to`);
        badge.textContent = 'Team Only';
        item.appendChild(badge);
      }

      item.addEventListener('click', () => {
        state.registration = opt.value;
        // If switching to team-only registration, set doctors to 0
        if (isTeamOnly(opt.value)) {
          state.doctors = 0;
          if (state.teamMembers === 0) state.teamMembers = 1;
        } else if (state.doctors === 0 && config.type !== 'simple') {
          state.doctors = 1;
        }
        // Reset mastermind if didactic only and not applicable
        if (isDidacticOnly(opt.value) && config.mastermindDoApplies === false) {
          state.isMastermind = false;
        }
        render();
      });

      regList.appendChild(item);
    });
    regSection.appendChild(regList);
    widget.appendChild(regSection);

    const isDO = isDidacticOnly(state.registration);
    const isTO = isTeamOnly(state.registration);

    // MasterMind toggle (only for courses that have it, and not for didactic-only when excluded)
    const showMM = config.hasMastermind && !(isDO && config.mastermindDoApplies === false);
    if (showMM) {
      const mmBox = el('div', `${PREFIX}-mm-box`);
      const mmLeft = el('div');
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
        render();
      });
      mmBox.appendChild(toggle);
      widget.appendChild(mmBox);
    } else {
      state.isMastermind = false;
    }

    // Steppers section
    if (config.type === 'teamMembers') {
      // Doctor stepper
      if (!isTO) {
        const docRate = config.doctorPrice;
        widget.appendChild(
          stepper('Doctors', `$${fmt(docRate)}/doctor`, state.doctors, 0, 10, null, (v) => {
            state.doctors = v;
            render();
          })
        );
      }

      // Team Members stepper
      const tmRate = config.teamMemberPrice;
      widget.appendChild(
        stepper('Team Members', `$${fmt(tmRate)}/person`, state.teamMembers, 0, config.maxTeamMembers, null, (v) => {
          state.teamMembers = v;
          render();
        })
      );
    } else if (config.type === 'assistants') {
      // Doctor stepper
      const docRate = isDO ? config.didacticOnlyPrice : config.doctorPrice;
      const effectiveRate = state.isMastermind ? docRate - config.mastermindDiscount : docRate;
      widget.appendChild(
        stepper('Doctors', `$${fmt(effectiveRate)}/doctor`, state.doctors, 1, 10, null, (v) => {
          state.doctors = v;
          render();
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
          render();
        })
      );
    } else if (config.type === 'simple') {
      // Doctor stepper
      widget.appendChild(
        stepper('Doctors', `$${fmt(config.doctorPrice)}/doctor`, state.doctors, 1, 10, null, (v) => {
          state.doctors = v;
          render();
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
        render();
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
          render();
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

    // Add to Cart button
    const btn = document.createElement('button');
    btn.className = `${PREFIX}-add-btn`;
    btn.textContent = 'Add to Cart';
    btn.disabled = !isValid || !state.registration;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Adding...';
      addToCart(productId, config, state, allRegistrationOptions, (success) => {
        if (success) {
          btn.textContent = 'Added!';
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = 'Add to Cart';
          }, 2000);
        } else {
          btn.textContent = 'Error — try again';
          btn.disabled = false;
        }
      });
    });
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
