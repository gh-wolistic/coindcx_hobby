# Alerter Pair Filters

## 🚫 Default Excluded Pairs

The alerter now **excludes these high-priced/low-volatility pairs** by default:

```typescript
DEFAULT_EXCLUDED_PAIRS = [
  'B-AUCTION_USDT',  // High price, low volume
  'B-BCH_USDT',      // Bitcoin Cash - high price
  'B-BNB_USDT',      // Binance Coin - high price
  'B-BTC_USDT',      // Bitcoin - too expensive per contract
  'B-BZ_USDT',       // Low volume
  'B-ETH_USDT',      // Ethereum - high price
  'B-PAXG_USDT',     // Paxos Gold - very high price
  'B-XAU_USDT',      // Gold - very high price
  'B-XMR_USDT',      // Monero - high price
  'B-YFI_USDT',      // Yearn Finance - very high price
]
```

**Why exclude these?**
- 💰 **High margin requirements** (BTC, ETH, etc.)
- 📉 **Lower volatility** relative to altcoins
- 💸 **Less attractive R:R** for smaller accounts
- 🎯 **Focus on tradeable altcoins** with better setups

---

## 📊 Current Scanning

- **Total Active Pairs:** ~438
- **Excluded:** 10
- **Scanned:** ~428 pairs ✅

This focuses the alerter on **high-probability altcoin setups** where your capital works harder!

---

## 🔧 Customize Exclusions

### Option 1: Modify in Code

Edit `src/lib/screener.ts`:

```typescript
export const DEFAULT_EXCLUDED_PAIRS = [
  // Remove pairs you want to scan
  // Add more pairs you want to exclude
  'B-YOUR_PAIR_USDT',
];
```

### Option 2: Custom Alerter Instance

In `scripts/standalone-alerter.ts`:

```typescript
// Scan ALL pairs (including BTC, ETH)
const alerter = new CoinDCXAlerter('balanced', []);

// OR scan only specific exclusions
const customExclusions = ['B-BTC_USDT', 'B-ETH_USDT'];
const alerter = new CoinDCXAlerter('balanced', customExclusions);
```

### Option 3: Environment Variable (Future Enhancement)

Could add:
```env
EXCLUDED_PAIRS=B-BTC_USDT,B-ETH_USDT,B-BNB_USDT
```

---

## 💡 Recommendations

### For Small Accounts (< ₹50k)
**Keep default exclusions** ✅
- Focus on altcoins with better volatility
- Lower margin requirements
- Better R:R opportunities

### For Larger Accounts (> ₹2L)
**Consider including BTC/ETH:**
```typescript
const minimalExclusions = [
  'B-PAXG_USDT',  // Gold - too expensive
  'B-XAU_USDT',   // Gold
  'B-YFI_USDT',   // Very high price
];
const alerter = new CoinDCXAlerter('balanced', minimalExclusions);
```

### For Aggressive Trading
**Scan everything:**
```typescript
const alerter = new CoinDCXAlerter('aggressive', []);
```

---

## 🎯 Pro Tip

The multi-timeframe logic is **even more important** for high-priced pairs like BTC/ETH. If you include them:

1. Use **strict** preset for better accuracy
2. Watch for **lower RVOL thresholds** (BTC rarely hits 10x)
3. Consider **longer timeframes** (4H + 1H instead of 1H + 15M)

---

## ✅ Current Status

Your alerter is now **properly filtered** and will:
- ✅ Skip expensive pairs (BTC, ETH, etc.)
- ✅ Focus on ~428 tradeable altcoins
- ✅ Find better risk-reward setups
- ✅ Use capital more efficiently

**No action needed** - the filter is active! 🎯
