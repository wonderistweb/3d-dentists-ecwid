# 3D Dentists — Ecwid Storefront Customization Script

Custom JavaScript widget that replaces Ecwid's native product options UI on 3D Dentists course pages. Handles team-only checkout, multi-doctor purchasing, and MasterMind member pricing.

## Deploy to Vercel

This project auto-deploys via Vercel on every `git push`. Vercel runs `vite build` and serves `dist/ecwid-custom.js`.

### Manual build

```bash
npm install
npm run build     # outputs dist/ecwid-custom.js
npm test          # run pricing unit tests
```

## Ecwid Setup

In Ecwid admin → **Settings → Design → Custom JavaScript**, paste:

```html
<script src="https://3d-dentists-ecwid.vercel.app/ecwid-custom.js"></script>
```

*(Replace URL with your actual Vercel deployment URL)*

The script activates only on product pages with a SKU listed in `COURSE_CONFIG` (`src/config.js`). All other products use Ecwid's native UI unchanged.

## Adding a New Course

Edit `src/config.js` and add a new entry keyed by SKU:

```js
'3D-NEW-001': {
  type: 'teamMembers',   // or 'assistants' or 'simple'
  doctorPrice: 2995,
  teamMemberPrice: 1295,
  maxTeamMembers: 5,
  hasMastermind: false,
  hasLivePatient: false,
},
```

Push to deploy. No other code changes needed.

## Adding a New Date to an Existing Course

1. In Ecwid admin, add the new Registration option value (e.g., "Sep 15-16 2027 - Nashville TN")
2. Add variation rows for that date with correct pricing
3. If team-only: add "Team Only - Sep 15-16 2027 - Nashville TN" option + variations
4. If MasterMind: add "[date] - MasterMind" option + variations
5. **No code changes required** — the script reads Registration values from the DOM

## Multi-Doctor Cart Behavior

When a customer selects 2+ doctors, the script adds **two line items** to the cart:

1. **First item**: 1 doctor + all assistants/team members + options (uses Ecwid variation pricing)
2. **Second item**: remaining doctors (quantity = N-1), no assistants (uses doctor-only variation)

This is required because Ecwid's variation system can't multiply per-doctor MasterMind discounts.

## Project Structure

```
src/
├── main.js      # Entry — Ecwid event listeners, SKU detection
├── config.js    # COURSE_CONFIG (the only file to edit for new courses)
├── pricing.js   # Pure price calculation functions
├── ui.js        # DOM rendering — steppers, toggles, price display
└── cart.js      # Ecwid.Cart.addProduct wrapper + multi-doctor logic
test/
└── pricing.test.js   # 24 unit tests for all pricing paths
```
