# Archived Dashboard

This folder preserves the original card-based CoinDCX dashboard for reference.

Archived files:
- `dashboard-page.tsx`: original homepage that rendered the card grid.
- `components/PriceCard.tsx`: original card component with overview and supertrend tabs.
- `components/SupertrendTab.tsx`: per-card supertrend detail tab.
- `components/CandleChart.tsx`: legacy chart component that was not used by the live app.

These files are no longer part of the active homepage flow. The live app now uses a screener-first UI and a consolidated `/api/screener` route to reduce API fan-out.