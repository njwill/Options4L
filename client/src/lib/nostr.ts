import { nip19 } from 'nostr-tools';

export function hexToNpub(hexPubkey: string): string {
  try {
    return nip19.npubEncode(hexPubkey);
  } catch (e) {
    console.error('Failed to encode pubkey to npub:', e);
    return hexPubkey;
  }
}

export function truncateNpub(npub: string | null | undefined): string {
  if (!npub) return '';
  if (npub.length <= 20) return npub;
  return `${npub.slice(0, 12)}...${npub.slice(-8)}`;
}
