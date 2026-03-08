/**
 * 3D Dentists — Ecwid Storefront Customization Script
 *
 * Entry point. Listens for Ecwid page loads, detects product via
 * product ID mapping, and renders the custom booking widget.
 */
import { COURSE_CONFIG, PRODUCT_ID_MAP } from './config.js';
import { renderWidget, parseRegistrationOptions } from './ui.js';

(function init() {
  // Guard: Ecwid must exist
  if (typeof Ecwid === 'undefined') {
    console.warn('[3D-Dentists] Ecwid not found. Custom script inactive.');
    return;
  }

  Ecwid.OnAPILoaded.add(function () {
    Ecwid.OnPageLoaded.add(function (page) {
      if (page.type !== 'PRODUCT') return;

      try {
        handleProductPage(page.productId);
      } catch (e) {
        console.error('[3D-Dentists] Error rendering custom UI:', e);
        // On error, leave Ecwid's native UI visible (graceful degradation)
      }
    });
  });
})();

/**
 * Called when a product page renders.
 * Looks up SKU via product ID map, then renders custom widget.
 */
function handleProductPage(productId) {
  const sku = PRODUCT_ID_MAP[productId];
  if (!sku) {
    // Unknown product — leave native UI intact
    return;
  }

  const config = COURSE_CONFIG[sku];
  if (!config) {
    return;
  }

  // Wait for native options to render (Ecwid renders async)
  waitForElement('.product-details__product-options', (nativeOptions) => {
    // Find Registration option container by class
    const regContainer = nativeOptions.querySelector('.details-product-option--Registration');
    const allOptions = parseRegistrationOptions(regContainer);

    if (allOptions.length === 0) {
      console.warn('[3D-Dentists] No registration options found for', sku);
      return;
    }

    console.log('[3D-Dentists] Rendering custom UI for', sku, '— found', allOptions.length, 'registration options');
    renderWidget(nativeOptions, config, productId, allOptions);
  });
}

/**
 * Poll for a DOM element to appear (Ecwid renders async).
 */
function waitForElement(selector, callback, maxWait = 10000) {
  const el = document.querySelector(selector);
  if (el) {
    callback(el);
    return;
  }

  const start = Date.now();
  const interval = setInterval(() => {
    const el = document.querySelector(selector);
    if (el) {
      clearInterval(interval);
      callback(el);
    } else if (Date.now() - start > maxWait) {
      clearInterval(interval);
      console.warn('[3D-Dentists] Timed out waiting for', selector);
    }
  }, 200);
}
