import type { Transaction } from '@shared/schema';

export async function computeTransactionHash(txn: Transaction): Promise<string> {
  const option = txn.option || {};
  const key = [
    txn.activityDate || '',
    txn.instrument,
    txn.transCode,
    txn.description || '',
    txn.quantity.toString(),
    txn.price.toString(),
    txn.amount.toString(),
    option.symbol || '',
    option.expiration || '',
    option.strike?.toString() || '',
    option.optionType || '',
  ].join('|');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
