// economy.ts pulls in lucide-react-native purely for icon metadata (never rendered here);
// the package ships ESM that jest's default transformIgnorePatterns doesn't cover.
jest.mock('lucide-react-native', () => ({
  Brain: 'Brain',
  Gem: 'Gem',
  Swords: 'Swords',
  Shield: 'Shield',
  Sparkles: 'Sparkles',
  Zap: 'Zap',
  Bolt: 'Bolt',
  Infinity: 'Infinity',
  Award: 'Award',
  Crown: 'Crown',
}));

import { convertQuote, crossRate, formatCurrencyAmount } from '../economy';

describe('crossRate', () => {
  it('returns 1 for the same currency on both sides', () => {
    expect(crossRate('credits', 'credits')).toBe(1);
    expect(crossRate('timecoin', 'timecoin')).toBe(1);
  });

  it('matches the documented tier rates going up the chain', () => {
    expect(crossRate('credits', 'shards')).toBe(1_000);
    expect(crossRate('shards', 'crystals')).toBe(100);
    expect(crossRate('crystals', 'timecoin')).toBe(10);
  });

  it('is the reciprocal when the direction is reversed', () => {
    expect(crossRate('shards', 'credits')).toBeCloseTo(1 / 1_000);
  });
});

describe('convertQuote', () => {
  it('quotes zero cost and zero fee for wanting zero of the target currency', () => {
    const quote = convertQuote(0, 'credits', 'shards');
    expect(quote.receive).toBe(0);
    expect(quote.give).toBe(0);
    expect(quote.fee).toBe(0);
  });

  it('applies the 1% fee on top of the gross cost', () => {
    const quote = convertQuote(1, 'credits', 'shards');
    // wants 1 shard, paying in credits: 1 shard = 1000 credits, gross = 1000, fee = 10, give = 1010
    expect(quote.rate).toBe(1_000);
    expect(quote.fee).toBeCloseTo(10);
    expect(quote.give).toBeCloseTo(1_010);
    expect(quote.receive).toBe(1);
  });

  it('scales linearly with negative wantTo (treated as a debit quote)', () => {
    const quote = convertQuote(-1, 'credits', 'shards');
    expect(quote.give).toBeCloseTo(-1_010);
    expect(quote.receive).toBe(-1);
  });
});

describe('formatCurrencyAmount', () => {
  it('rounds credits and shards to whole numbers', () => {
    // ru-RU toLocaleString uses a non-breaking space (U+00A0) as the thousands separator.
    expect(formatCurrencyAmount('credits', 1234.6)).toBe('1 235');
    expect(formatCurrencyAmount('shards', 0.4)).toBe('0');
  });

  it('keeps up to 3 fractional digits for crystals and timecoin', () => {
    expect(formatCurrencyAmount('crystals', 1.23456)).toBe('1,235');
    expect(formatCurrencyAmount('timecoin', 0)).toBe('0');
  });

  it('formats negative amounts without throwing', () => {
    expect(formatCurrencyAmount('credits', -5)).toBe('-5');
  });
});
