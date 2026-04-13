const crypto = require('crypto');
const fs = require('fs');

// ==========================================
// 핵심 함수 (백엔드 삽입용)
// ==========================================

// 코디네이터 키쌍 생성 (서버 시작 시 1회만 실행)
function generateCoordinatorKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  return { privateKey, publicKey };
}

// 공유키 생성 (투표자 공개키 받았을 때)
function deriveSharedKey(coordinatorPrivateKey, voterPublicKey) {
  const sharedKey = crypto.diffieHellman({
    privateKey: coordinatorPrivateKey,
    publicKey: voterPublicKey,
  });
  return sharedKey; // Buffer
}

// ==========================================
// 테스트용 (백엔드 삽입 시 아래 전부 삭제)
// ==========================================

function getCoordinatorKeyPair() {
  if (fs.existsSync('coordPrivateKey.json')) {
    console.log("기존 키쌍 사용!");
    const privateJWK = JSON.parse(fs.readFileSync('coordPrivateKey.json', 'utf8'));
    const publicJWK = JSON.parse(fs.readFileSync('coordPublicKey.json', 'utf8'));
    return {
      privateKey: crypto.createPrivateKey({ key: privateJWK, format: 'jwk' }),
      publicKey: crypto.createPublicKey({ key: publicJWK, format: 'jwk' }),
    };
  }

  console.log("새 키쌍 생성!");
  const { privateKey, publicKey } = generateCoordinatorKeyPair();
  fs.writeFileSync('coordPublicKey.json', JSON.stringify(publicKey.export({ format: 'jwk' }), null, 2));
  fs.writeFileSync('coordPrivateKey.json', JSON.stringify(privateKey.export({ format: 'jwk' }), null, 2));
  return { privateKey, publicKey };
}

const { privateKey } = getCoordinatorKeyPair();

const voterJWK = JSON.parse(fs.readFileSync('voterPublicKey.json', 'utf8'));
const voterPublicKey = crypto.createPublicKey({ key: voterJWK, format: 'jwk' });

const sharedKey = deriveSharedKey(privateKey, voterPublicKey);
console.log("공유키:", sharedKey.toString('hex'));
