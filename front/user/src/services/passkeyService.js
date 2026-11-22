// src/services/passkeyService.js
//
// 패스키(WebAuthn) PRF 확장으로 "기기를 바꿔도 같은 값"인 비밀 시드를 얻는다.
//  - 같은 패스키 + 같은 salt → 항상 같은 32바이트. 서버는 이 값을 볼 수 없다 (브라우저/인증기 안에서만 계산).
//  - 패스키는 구글 비밀번호 관리자·아이클라우드 키체인으로 기기 간 동기화된다.
//  - 서버 검증은 하지 않는다: 로그인 용도가 아니라 비밀값을 뽑는 용도라 challenge 는 아무 값이나 된다.
//  - 패스키는 도메인(rpId)에 묶인다 → 서비스 도메인이 바뀌면 같은 시드를 다시 얻을 수 없다. 운영 도메인을 고정할 것.

const PRF_SALT = new TextEncoder().encode('jnu-vote:voter-seed:v1');
const RP_NAME = '제주대학교 전자투표';

export class PasskeyPrfUnsupportedError extends Error {
  constructor(message = '이 브라우저(또는 기기)는 패스키 비밀값(PRF)을 지원하지 않습니다.') {
    super(message);
    this.name = 'PasskeyPrfUnsupportedError';
  }
}

const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** WebAuthn 자체가 없으면 false. PRF 지원 여부는 브라우저가 알려줄 때만 확정(모르면 true = 시도해 본다) */
export async function isPasskeyLikelySupported() {
  const PKC = globalThis.PublicKeyCredential;
  if (!PKC || !globalThis.navigator?.credentials) return false;
  try {
    if (typeof PKC.getClientCapabilities === 'function') {
      const caps = await PKC.getClientCapabilities();
      if (caps && 'extension:prf' in caps) return Boolean(caps['extension:prf']);
    }
  } catch {
    /* 모르면 시도 */
  }
  return true;
}

function prfFirst(credential) {
  const out = credential?.getClientExtensionResults?.()?.prf?.results?.first;
  return out ? new Uint8Array(out) : null;
}

async function getWithPrf(credentialId) {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      userVerification: 'required',
      allowCredentials: credentialId ? [{ type: 'public-key', id: credentialId }] : [],
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  });
  const out = prfFirst(credential);
  if (!out) throw new PasskeyPrfUnsupportedError();
  return out;
}

/**
 * 새 패스키를 만들고 시드(32바이트)를 돌려준다.
 * 일부 브라우저는 생성 시점에 PRF 결과를 주지 않으므로, 없으면 바로 한 번 더 인증해서 받는다.
 */
export async function createPasskeySeed(label) {
  const name = String(label || '유권자');
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: random(32),
      rp: { name: RP_NAME },
      user: { id: random(16), name, displayName: name },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  });
  const ext = credential?.getClientExtensionResults?.()?.prf;
  if (ext && ext.enabled === false) throw new PasskeyPrfUnsupportedError();
  return prfFirst(credential) ?? getWithPrf(credential.rawId);
}

/** 이미 만든(동기화된) 패스키로 시드를 다시 얻는다. 사용자가 패스키를 고른다. */
export async function restorePasskeySeed() {
  return getWithPrf(null);
}
