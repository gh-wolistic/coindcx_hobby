/**
 * Supertrend Indicator Calculation
 * - Uses Average True Range (ATR) for volatility
 * - Default parameters: period=10, multiplier=3
 */

interface Candle {
  high: number;
  low: number;
  close: number;
  open?: number;
  volume?: number;
  time?: number;
}

interface SupertrendValue {
  value: number;
  direction: 'uptrend' | 'downtrend';
}

interface SupertrendSignal {
  type: 'direction_change' | 'ltp_cross';
  timestamp: number;
  prevValue: number;
  currValue: number;
  direction: 'uptrend' | 'downtrend';
}

interface SupertrendResult {
  current: SupertrendValue;
  signals: SupertrendSignal[];
  history: SupertrendValue[];
}

/**
 * Calculate True Range for ATR calculation
 */
function calculateTrueRange(current: Candle, previous?: Candle): number {
  if (!previous) {
    return current.high - current.low;
  }

  const tr1 = current.high - current.low;
  const tr2 = Math.abs(current.high - previous.close);
  const tr3 = Math.abs(current.low - previous.close);

  return Math.max(tr1, tr2, tr3);
}

/**
 * Calculate Average True Range (ATR)
 */
function calculateATR(candles: Candle[], period: number): (number | null)[] {
  const trValues: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const tr = calculateTrueRange(candles[i], candles[i - 1]);
    trValues.push(tr);
  }

  // Fill with null until we have enough data for first SMA
  const atrValues: (number | null)[] = new Array(period - 1).fill(null);

  // Seed with simple average of first `period` TRs
  let atr = trValues.slice(0, period).reduce((s, v) => s + v, 0) / period;
  atrValues.push(atr);

  // Wilder's RMA for the rest
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
    atrValues.push(atr);
  }

  return atrValues;
}

/**
 * Calculate Supertrend values
 */
export function calculateSupertrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3
): SupertrendResult {
  if (candles.length < period) {
    return {
      current: { value: 0, direction: 'uptrend' },
      signals: [],
      history: [],
    };
  }

  const atrValues = calculateATR(candles, period);
  const history: SupertrendValue[] = [];
  const signals: SupertrendSignal[] = [];

  let prevDirection: 'uptrend' | 'downtrend' = 'uptrend';
  let finalUpperBand = 0;
  let finalLowerBand = 0;
  let bandsInitialized = false;

  for (let i = 0; i < candles.length; i++) {
    const atr = atrValues[i];

    // Skip candles until ATR is properly seeded (first period-1 values are null)
    if (atr === null) {
      history.push({ value: 0, direction: 'uptrend' });
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;

    // Calculate basic bands
    const basicUpperBand = hl2 + multiplier * atr;
    const basicLowerBand = hl2 - multiplier * atr;

    // Initialize bands on first valid ATR candle
    if (!bandsInitialized) {
      finalUpperBand = basicUpperBand;
      finalLowerBand = basicLowerBand;
      bandsInitialized = true;
    } else {
      // Upper Band: only moves down; resets when prev close was above it
      if (basicUpperBand < finalUpperBand || candles[i - 1].close > finalUpperBand) {
        finalUpperBand = basicUpperBand;
      }
      // Lower Band: only moves up; resets when prev close was below it
      if (basicLowerBand > finalLowerBand || candles[i - 1].close < finalLowerBand) {
        finalLowerBand = basicLowerBand;
      }
    }

    // Determine direction
    let direction: 'uptrend' | 'downtrend' = prevDirection;

    if (prevDirection === 'uptrend') {
      if (candles[i].close <= finalLowerBand) {
        direction = 'downtrend';
      }
    } else {
      if (candles[i].close >= finalUpperBand) {
        direction = 'uptrend';
      }
    }

    // Detect direction change
    if (direction !== prevDirection && i > 0) {
      signals.push({
        type: 'direction_change',
        timestamp: candles[i]?.time || i,
        prevValue: direction === 'uptrend' ? finalLowerBand : finalUpperBand,
        currValue: direction === 'uptrend' ? finalUpperBand : finalLowerBand,
        direction,
      });
    }

    const supertrendValue = direction === 'uptrend' ? finalLowerBand : finalUpperBand;

    history.push({
      value: supertrendValue,
      direction,
    });

    prevDirection = direction;
  }

  // Detect LTP crosses for last few candles
  for (let i = Math.max(0, candles.length - 5); i < candles.length; i++) {
    if (i > 0) {
      const prevClose = candles[i - 1].close;
      const currClose = candles[i].close;
      const prevSupertrend = history[i - 1];
      const currSupertrend = history[i];

      // Check if supertrend and LTP crossed
      const wasAbove = prevClose > prevSupertrend.value;
      const isNowBelow = currClose < currSupertrend.value;
      const wasBelow = prevClose < prevSupertrend.value;
      const isNowAbove = currClose > currSupertrend.value;

      if ((wasAbove && isNowBelow) || (wasBelow && isNowAbove)) {
        // Avoid duplicate signals
        const isDuplicate = signals.some(
          (s) => s.type === 'ltp_cross' && s.timestamp === (candles[i]?.time || i)
        );

        if (!isDuplicate) {
          signals.push({
            type: 'ltp_cross',
            timestamp: candles[i]?.time || i,
            prevValue: prevSupertrend.value,
            currValue: currSupertrend.value,
            direction: currSupertrend.direction,
          });
        }
      }
    }
  }

  return {
    current: history[history.length - 1] || { value: 0, direction: 'uptrend' },
    signals: signals.reverse(), // Most recent first
    history,
  };
}

/**
 * Format timestamp for display
 */
export function formatSignalTime(timestamp: number): string {
  const date = new Date(typeof timestamp === 'number' && timestamp > 1000000000000 ? timestamp : timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Determine supertrend status for filtering
 */
export function getSuperTrendStatus(
  ltpValue: number,
  supertrendValue: number,
  signals: SupertrendSignal[]
): {
  type: 'above' | 'below' | 'crossed_above' | 'crossed_below';
  distance: number;
  percentDistance: number;
} {
  const isAbove = ltpValue > supertrendValue;
  const distance = Math.abs(ltpValue - supertrendValue);
  const percentDistance = (distance / supertrendValue) * 100;

  // Check if there's a crossing signal in the last few items
  const recentCrossing = signals.find(
    (s) => s.type === 'ltp_cross' && Date.now() - (typeof s.timestamp === 'number' && s.timestamp > 1000000000000 ? s.timestamp : s.timestamp * 1000) < 3600000 // Last hour
  );

  if (recentCrossing) {
    return {
      type: recentCrossing.direction === 'uptrend' ? 'crossed_above' : 'crossed_below',
      distance,
      percentDistance,
    };
  }

  return {
    type: isAbove ? 'above' : 'below',
    distance,
    percentDistance,
  };
}
