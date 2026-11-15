/**
 * Decrypts a Web Push message (RFC 8291, content coding aes128gcm, RFC 8188) so a test can
 * read what the server sent to a device. The test made the device's key pair itself, so
 * it is the only party able to decrypt. Used only with the push stub.
 */
import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";

export interface DeviceKeys {
  /** Uncompressed P-256 public key, base64url (what the browser would send as keys.p256dh). */
  p256dh: string;
  /** 16 random bytes, base64url (what the browser would send as keys.auth). */
  auth: string;
  /** Private key, kept only in the test process. */
  ecdh: ReturnType<typeof createECDH>;
}

export function makeDeviceKeys(): DeviceKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    ecdh,
  };
}

function hkdf(ikm: Buffer, salt: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(hkdfSync("sha256", ikm, salt, info, length));
}

/** Decrypts one aes128gcm push body with the device keys. Returns the UTF-8 text. */
export function decryptPush(bodyBase64: string, keys: DeviceKeys): string {
  const body = Buffer.from(bodyBase64, "base64");
  const salt = body.subarray(0, 16);
  const idLength = body[20];
  const serverPublic = body.subarray(21, 21 + idLength); // the sender's ephemeral key
  const ciphertext = body.subarray(21 + idLength);

  const uaPublic = keys.ecdh.getPublicKey();
  const authSecret = Buffer.from(keys.auth, "base64url");
  const sharedSecret = keys.ecdh.computeSecret(serverPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, serverPublic]);
  const ikm = hkdf(sharedSecret, authSecret, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(tag);
  const padded = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  // The record ends with a 0x02 delimiter, then zero padding.
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end -= 1;
  return padded.subarray(0, end).toString("utf8");
}
