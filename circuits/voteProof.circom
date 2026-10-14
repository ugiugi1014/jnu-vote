pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/escalarmulfix.circom";
include "../node_modules/circomlib/circuits/escalarmulany.circom";

// 투표 유효성 증명 (ZKP ①)
// 증명 내용:
//   1) nullifier = Poseidon(secret)                       -> 이중투표 방지
//   2) 0 <= candidateId < numCandidates                   -> 유효 후보
//   3) ephPub = ephPriv * Base8                           -> 임시 공개키가 ephPriv와 짝
//   4) shared = ephPriv * coordPub (BabyJubJub ECDH)      -> 공유키를 회로 안에서 계산
//   5) ciphertext = candidateId + Poseidon(shared.x, shared.y)
//      -> 체인에 올라가는 암호문이 실제로 (2)의 유효 후보를 암호화한 것임을 보장
template VoteProof() {
    // 비밀 입력
    signal input secret;
    signal input candidateId;
    signal input ephPriv;

    // 공개 입력 (컨트랙트가 저장값/설정값과 대조)
    signal input numCandidates;
    signal input coordPubX;
    signal input coordPubY;
    signal input ciphertext;
    signal input ephPubX;
    signal input ephPubY;

    // 공개 출력
    signal output nullifier;

    // 1. nullifier
    component pos = Poseidon(1);
    pos.inputs[0] <== secret;
    nullifier <== pos.out;

    // 2. 후보 범위. LessThan(8)은 입력이 8비트일 때만 안전하므로 먼저 8비트로 제한한다.
    component idBits = Num2Bits(8);
    idBits.in <== candidateId;
    component ncBits = Num2Bits(8);
    ncBits.in <== numCandidates;
    component lt = LessThan(8);
    lt.in[0] <== candidateId;
    lt.in[1] <== numCandidates;
    lt.out === 1;

    // 3. 임시 공개키
    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];
    component ephBits = Num2Bits(253);
    ephBits.in <== ephPriv;
    component ephMul = EscalarMulFix(253, BASE8);
    for (var i = 0; i < 253; i++) {
        ephMul.e[i] <== ephBits.out[i];
    }
    ephMul.out[0] === ephPubX;
    ephMul.out[1] === ephPubY;

    // 4. ECDH 공유점
    component shared = EscalarMulAny(253);
    for (var i = 0; i < 253; i++) {
        shared.e[i] <== ephBits.out[i];
    }
    shared.p[0] <== coordPubX;
    shared.p[1] <== coordPubY;

    // 5. 암호문 바인딩 (유한체 덧셈 암호화)
    component ks = Poseidon(2);
    ks.inputs[0] <== shared.out[0];
    ks.inputs[1] <== shared.out[1];
    ciphertext === candidateId + ks.out;
}

component main {public [numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY]} = VoteProof();
