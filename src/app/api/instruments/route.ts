import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch list of active futures instruments
    const response = await fetch(
      'https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=INR',
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch futures instruments');
    }

    const pairs: string[] = await response.json();
    
    // Fetch details for each instrument
    const instrumentsWithDetails = await Promise.all(
      pairs.map(async (pair: string) => {
        try {
          const detailResponse = await fetch(
            `https://api.coindcx.com/exchange/v1/derivatives/futures/data/instrument?pair=${pair}&margin_currency_short_name=INR`,
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );

          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            const instrument = detailData.instrument;
            
            return {
              pair_id: pair,
              symbol: instrument.position_currency_short_name,
              market: pair,
              pair: pair,
              base_currency: instrument.settle_currency_short_name,
              target_currency: instrument.position_currency_short_name,
              last_traded_price: 0,
              day_high_price: 0,
              day_low_price: 0,
              volume_24h: 0,
            };
          }
        } catch (err) {
          console.error(`Error fetching details for ${pair}:`, err);
        }
        
        return {
          pair_id: pair,
          symbol: pair.split('_')[0].replace('B-', ''),
          market: pair,
          pair: pair,
          base_currency: 'INR',
          target_currency: pair.split('_')[0].replace('B-', ''),
          last_traded_price: 0,
          day_high_price: 0,
          day_low_price: 0,
          volume_24h: 0,
        };
      })
    );

    // Fetch current prices from futures RT endpoint
    const pricesResponse = await fetch(
      'https://public.coindcx.com/market_data/v3/current_prices/futures/rt',
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (pricesResponse.ok) {
      const pricesData = await pricesResponse.json();
      const prices = pricesData.prices || {};

      // Merge price data with instruments
      return NextResponse.json(
        instrumentsWithDetails.map((inst: any) => {
          const priceData = prices[inst.pair];
          return {
            ...inst,
            last_traded_price: parseFloat(String(priceData?.ls || 0)),
            day_high_price: parseFloat(String(priceData?.h || 0)),
            day_low_price: parseFloat(String(priceData?.l || 0)),
            volume_24h: parseFloat(String(priceData?.v || 0)),
          };
        })
      );
    }

    return NextResponse.json(instrumentsWithDetails);
  } catch (error) {
    console.error('Error fetching futures instruments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch futures instruments' },
      { status: 500 }
    );
  }
}
