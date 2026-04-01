# CoinDCX Trading Pairs Dashboard

A Next.js dashboard displaying real-time trading pairs and 1-hour candle charts from CoinDCX exchange.

## Features

- **Real-time Data**: Displays latest prices for all active trading pairs on CoinDCX
- **1-Hour Candles**: View 24-hour history of 1-hour candlestick data for each pair
- **Interactive Charts**: Expandable price cards with Recharts candlestick visualization
- **Search Functionality**: Filter trading pairs by symbol or market name
- **Responsive Design**: Mobile-friendly dashboard with Tailwind CSS styling
- **24H Statistics**: Shows 24-hour high, low, and trading volume for each pair

## Technology Stack

- **Framework**: Next.js 14+ with TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Data Source**: CoinDCX Public API

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── instruments/
│   │   │   └── route.ts      # Fetch active trading pairs
│   │   └── candles/
│   │       └── route.ts      # Fetch 1-hour candle data
│   ├── page.tsx              # Main dashboard page
│   └── layout.tsx
├── components/
│   ├── PriceCard.tsx         # Individual trading pair card
│   └── CandleChart.tsx       # Recharts candlestick component
```

## API Endpoints

### `/api/instruments`
Fetches all active trading pairs from CoinDCX with latest prices and 24-hour statistics.

**Response:**
```json
[
  {
    "pair_id": "B-BTC_USDT",
    "symbol": "BTCUSDT",
    "market": "BTCUSDT",
    "pair": "B-BTC_USDT",
    "last_traded_price": 45000,
    "day_high_price": 46000,
    "day_low_price": 44000,
    "volume_24h": 1000000
  }
]
```

### `/api/candles?pair=B-BTC_USDT`
Fetches 24 hours of 1-hour candle data for a specific trading pair.

**Parameters:**
- `pair` (required): Trading pair identifier (e.g., `B-BTC_USDT`)

**Response:**
```json
[
  {
    "open": 44500,
    "high": 45000,
    "low": 44400,
    "close": 44800,
    "volume": 50000,
    "time": 1709251200000
  }
]
```

## Features in Detail

### Dashboard Page
- Lists all active trading pairs from CoinDCX
- Shows current price with 24-hour change percentage
- Displays 24-hour high, low, and trading volume
- Real-time refresh button

### Price Card Component
- Click to expand and view 1-hour candlestick chart
- Shows price in Indian Rupees (₹)
- Color-coded percentage change (green for gains, red for losses)
- Summary statistics at a glance

### Candle Chart
- 1-hour resolution showing 24-hour history
- Displays Open, High, Low, and Close prices
- Built with Recharts for smooth rendering
- Interactive tooltips on hover

### Search & Filter
- Search by trading pair symbol
- Filter by market type
- Real-time filtering as you type

## CoinDCX API Integration

The dashboard uses the following CoinDCX Public APIs:

1. **Markets Details**: `GET /exchange/v1/markets_details`
   - Retrieves list of active trading pairs

2. **Ticker Data**: `GET /exchange/ticker`
   - Gets latest price information for all pairs

3. **Candles**: `GET /market_data/candles`
   - Fetches OHLC data for specific intervals

For more information, see: https://docs.coindcx.com/?javascript

## Development

### Building for Production
```bash
npm run build
npm run start
```

### Linting
```bash
npm run lint
```

## Performance Considerations

- Instruments are fetched once on page load
- Candle data is fetched on-demand when expanding a card
- Data is not cached to ensure real-time updates
- Consider implementing React Query or SWR for better caching if needed

## Future Enhancements

- [ ] Real-time WebSocket updates using CoinDCX Socket.IO
- [ ] Multiple timeframe options (5m, 15m, 1h, 4h, 1d)
- [ ] Technical indicators (RSI, MACD, etc.)
- [ ] Price alerts and notifications
- [ ] Favorites and watchlists
- [ ] Trading functionality integration
- [ ] Dark mode support

## Rate Limiting

Be aware of CoinDCX API rate limits:
- Most public endpoints: ~100 requests per minute
- See https://docs.coindcx.com for specific rate limits

## Error Handling

The dashboard gracefully handles errors:
- API failures show user-friendly error messages
- Retry functionality for failed requests
- Fallback UI for missing or incomplete data

## Styling

The dashboard uses Tailwind CSS with a dark theme:
- Dark slate background for reduced eye strain
- Blue accent colors for interactive elements
- Responsive grid layout (1-3 columns depending on screen size)

## License

MIT License - Feel free to use and modify

## Support

For issues related to CoinDCX API, visit: https://docs.coindcx.com

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
