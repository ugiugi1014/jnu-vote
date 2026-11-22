// node --test (front/user 에서 npm test)
import test from 'node:test';
import assert from 'node:assert';
import { buildPoseidon } from 'circomlibjs';
import {
  bytesToField, deriveSecret, resolveSecret, loadSeed, saveSeed, clearSeed,
  newRecoveryBytes, encodeRecoveryCode, decodeRecoveryCode, computeCommitment,
} from '../src/services/voterIdService.js';

const ADDR = '0x00000000000000000000000000000000000000AA';
const ADDR2 = '0x00000000000000000000000000000000000000BB';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('복구 코드: 인코딩 → 디코딩이 원래 바이트와 같다', async () => {
  for (let i = 0; i < 20; i++) {
    const b = newRecoveryBytes();
    const code = await encodeRecoveryCode(b);
    assert.match(code, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){6}$/);
    assert.deepStrictEqual(await decodeRecoveryCode(code), b);
    // 소문자, 공백 구분도 받아준다
    assert.deepStrictEqual(await decodeRecoveryCode(' ' + code.toLowerCase().replace(/-/g, ' ') + ' '), b);
  }
});

test('복구 코드: 한 글자 오타는 체크섬으로 거절된다', async () => {
  let rejected = 0;
  for (let i = 0; i < 20; i++) {
    const code = await encodeRecoveryCode(newRecoveryBytes());
    const chars = code.split('');
    chars[6] = chars[6] === 'A' ? 'B' : 'A';
    try { await decodeRecoveryCode(chars.join('')); } catch { rejected++; }
  }
  assert.ok(rejected >= 19, `오타 거절 ${rejected}/20`); // 10비트 체크섬: 우연히 통과할 확률 1/1024
  await assert.rejects(() => decodeRecoveryCode('ABCD-EFGH'));
});

test('secret 은 시드·선거 주소로 결정되고, 선거마다 다르다', async () => {
  const seed = bytesToField(newRecoveryBytes());
  const s1 = await deriveSecret(seed, ADDR);
  assert.strictEqual(await deriveSecret(seed, ADDR), s1);
  assert.notStrictEqual(await deriveSecret(seed, ADDR2), s1);
  const poseidon = await buildPoseidon();
  assert.strictEqual(s1, poseidon.F.toObject(poseidon([seed, BigInt(ADDR)])));
});

test('복구 코드만 있으면 다른 기기에서 같은 commitment 를 만든다', async () => {
  const bytes = newRecoveryBytes();
  const code = await encodeRecoveryCode(bytes);
  const deviceA = await computeCommitment(await deriveSecret(bytesToField(bytes), ADDR));
  const restored = bytesToField(await decodeRecoveryCode(code));
  const deviceB = await computeCommitment(await deriveSecret(restored, ADDR));
  assert.strictEqual(deviceB, deviceA);
});

test('시드 캐시 저장/불러오기, 이전 버전 선거별 secret 우선', async () => {
  const st = memStorage();
  assert.strictEqual(await resolveSecret(ADDR, st), null);
  const seed = 12345678901234567890n;
  assert.ok(saveSeed(seed, 'passkey', st));
  assert.deepStrictEqual(loadSeed(st), { seed, source: 'passkey' });
  assert.strictEqual(await resolveSecret(ADDR, st), await deriveSecret(seed, ADDR));
  st.setItem(`jnu-vote:voter-secret:${ADDR.toLowerCase()}`, '42');
  assert.strictEqual(await resolveSecret(ADDR, st), 42n);
  clearSeed(st);
  assert.strictEqual(loadSeed(st), null);
});

test('저장소가 막혀 있어도 예외 없이 false', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  assert.strictEqual(saveSeed(1n, 'code', broken), false);
  assert.strictEqual(loadSeed(broken), null);
});
