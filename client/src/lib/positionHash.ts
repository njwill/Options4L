import type { Position } from '@shared/schema';

export async function computePositionHash(position: Position): Promise<string> {
  const sortedLegs = [...position.legs]
    .sort((a, b) => {
      const aKey = `${a.expiration}|${a.strike}|${a.optionType}|${a.transCode}`;
      const bKey = `${b.expiration}|${b.strike}|${b.optionType}|${b.transCode}`;
      return aKey.localeCompare(bKey);
    })
    .map(leg => `${leg.expiration}|${leg.strike}|${leg.optionType}|${leg.transCode}`)
    .join(';');
  
  const key = [
    position.symbol,
    position.strategyType,
    position.entryDate,
    sortedLegs,
  ].join('|');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
