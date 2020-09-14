import crypto from 'crypto';

export function r() {
	return crypto.randomBytes(16);
}

export function c1(
	k: Buffer,
	rBuff: Buffer,
	pres: Buffer,
	preq: Buffer,
	iat: Buffer,
	ia: Buffer,
	rat: Buffer,
	ra: Buffer
) {
	const p1 = Buffer.concat([iat, rat, preq, pres]);

	const p2 = Buffer.concat([ra, ia, Buffer.from('00000000', 'hex')]);

	let res = xor(rBuff, p1);
	res = e(k, res);
	res = xor(res, p2);
	res = e(k, res);

	return res;
}

export function s1(k: Buffer, r1: Buffer, r2: Buffer) {
	return e(k, Buffer.concat([r2.slice(0, 8), r1.slice(0, 8)]));
}

export function e(key: Buffer, data: Buffer) {
	key = reverse(key);
	data = reverse(data);

	const cipher = crypto.createCipheriv('aes-128-ecb', key, '');
	cipher.setAutoPadding(false);

	return reverse(Buffer.concat([cipher.update(data), cipher.final()]));
}

export function xor(b1: Buffer, b2: Buffer) {
	const result = Buffer.alloc(b1.length);

	for (let i = 0; i < b1.length; i++) {
		// tslint:disable-next-line: no-bitwise
		result[i] = b1[i] ^ b2[i];
	}

	return result;
}

export function reverse(input: Buffer) {
	const output = Buffer.alloc(input.length);

	for (let i = 0; i < output.length; i++) {
		output[i] = input[input.length - i - 1];
	}

	return output;
}
