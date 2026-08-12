/** Minimal hex helpers. No dependencies — we only ever decode fixed-layout CCTP structs. */

export function strip0x(h: string): string {
	return h.startsWith('0x') || h.startsWith('0X') ? h.slice(2) : h;
}

export function isHex(s: string, bytes?: number): boolean {
	const h = strip0x(s);
	if (!/^[0-9a-fA-F]*$/.test(h) || h.length === 0) return false;
	return bytes === undefined ? h.length % 2 === 0 : h.length === bytes * 2;
}

export const isAddress = (s: string) => isHex(s, 20);
export const isTxHash = (s: string) => isHex(s, 32);

/** Read a big-endian unsigned integer from a byte offset. */
export function uintAt(hex: string, byteOffset: number, byteLen: number): bigint {
	const h = strip0x(hex).slice(byteOffset * 2, (byteOffset + byteLen) * 2);
	return h.length ? BigInt('0x' + h) : 0n;
}

export function numAt(hex: string, byteOffset: number, byteLen: number): number {
	return Number(uintAt(hex, byteOffset, byteLen));
}

/** Slice `byteLen` bytes as a 0x-prefixed lowercase hex string. */
export function sliceAt(hex: string, byteOffset: number, byteLen: number): string {
	return '0x' + strip0x(hex).slice(byteOffset * 2, (byteOffset + byteLen) * 2).toLowerCase();
}

/**
 * CCTP stores addresses as bytes32. On EVM domains that is a 20-byte address
 * left-padded with 12 zero bytes. Returns null when the padding is non-zero,
 * which means the value belongs to a non-EVM domain and must not be treated
 * as an address.
 */
export function bytes32ToAddress(b32: string): string | null {
	const h = strip0x(b32).toLowerCase().padStart(64, '0');
	if (h.length !== 64) return null;
	if (h.slice(0, 24) !== '0'.repeat(24)) return null;
	return '0x' + h.slice(24);
}

/** Left-pad a 20-byte address to a bytes32 log topic. */
export function addressToTopic(addr: string): string {
	return '0x' + strip0x(addr).toLowerCase().padStart(64, '0');
}

/** Addresses are always compared lowercased; we never render EIP-55 checksums. */
export function eqAddress(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	return strip0x(a).toLowerCase() === strip0x(b).toLowerCase();
}

export function normalizeAddress(a: string): string {
	return '0x' + strip0x(a).toLowerCase();
}

export function shorten(v: string, head = 6, tail = 4): string {
	if (v.length <= head + tail + 3) return v;
	return `${v.slice(0, head)}…${v.slice(-tail)}`;
}
