# Page Logic Reference

Central reference for page-level signal logic.

## Burst

- Tracks expansion candidates on 1h candles.
- Uses breakout context, supertrend alignment, and RVOL.
- Supports filtering, sorting, and exclusion controls.

## Fresh Burst

- Subset of Burst focused on newly triggered breakout events.
- Prioritizes first fresh trigger conditions.

## Short

- Mirrors burst logic for short-side breakdown candidates.
- Emphasizes bearish continuation and no-chase handling.

## Recommend

- Ranks candidates by conviction and recency.
- Returns one top setup plus runners.
- Includes confidence labels and entry/SL/TP levels.

## Wild

- Detects high-momentum OC body expansion events.
- Uses supertrend proximity threshold and optional crossing badge.
- Supports frequency controls and alert chime for new entries.

## Shared Controls

- Exclusion list is shared through local storage key:
  - coindcx-screener-excluded-pairs
- Most pages support refresh and status filtering.
