# Wild Logic

This document contains the Wild scanner logic that is intentionally kept out of the frontend page copy.

## Signal Conditions

A pair is listed on Wild when the latest 1-hour candle satisfies all checks below:

1. Body expansion: abs(close - open) >= 2 x abs(previous close - previous open)
2. Volume expansion: current volume > previous volume
3. Supertrend proximity: distance between signal candle close and supertrend value is within the configured threshold
4. Any direction: bullish and bearish candles are both valid

## Optional UI Controls

- Supertrend near threshold selector (0.5%, 1.0%, 1.5%)
- Check frequency selector (1 min, 5 min, 15 min, 60 min)
- New entry chime toggle

## Signal Labels

- ST Cross Up: candle crossed from below supertrend to above supertrend
- ST Cross Down: candle crossed from above supertrend to below supertrend

## Exclusion Filter

Wild uses the same exclusion source as recommend via local storage key:

- coindcx-screener-excluded-pairs
