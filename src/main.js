/**
 * 3D Dentists — Ecwid Storefront Customization Script
 *
 * Entry point. Listens for Ecwid page loads, detects product SKU,
 * and renders the custom booking widget when the product is in COURSE_CONFIG.
 */
import { COURSE_CONFIG } from './config.js';
import { renderWidget, parseRegistrationOptions, getVisibleOptions } from './ui.js';

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
 * Reads the SKU from the DOM, checks COURSE_CONFIG, and renders widget.
 */
function handleProductPage(productId) {
  // Wait for product details to fully render
  waitForElement('.product-details__product-sku .product-details__product-sku-value', (skuEl) => {
    const sku = skuEl.textContent.trim();
    const config = COURSE_CONFIG[sku];

    if (!config) {
      // Unknown SKU — leave native UI intact
      return;
    }

    // Find native options container
    const nativeOptions = document.querySelector('.product-details__options');
    if (!nativeOptions) {
      console.warn('[3D-Dentists] Native options container not found for', sku);
      return;
    }

    // Parse registration options from native DOM before hiding it
    const regContainer = nativeOptions.querySelector('[data-option-name="Registration"]')
      || findOptionByLabel(nativeOptions, 'Registration');
    const allOptions = parseRegistrationOptions(regContainer);

    if (allOptions.length === 0) {
      console.warn('[3D-Dentists] No registration options found for', sku);
      return;
    }

    renderWidget(nativeOptions, config, productId, allOptions);
  });
}

/**
 * Fallback: find the option container by scanning label text.
 */
function findOptionByLabel(parent, labelText) {
  const labels = parent.querySelectorAll('.product-details-module__title');
  for (const lbl of labels) {
    if (lbl.textContent.trim().toLowerCase() === labelText.toLowerCase()) {
      return lbl.closest('.product-details-module');
    }
  }
  return null;
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
