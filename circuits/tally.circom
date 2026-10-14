pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/escalarmulfix.circom";
include "../node_modules/circomlib/circuits/escalarmulany.circom";

// 집계 유효성 증명 (ZKP ②)
// 공유키를 비공개 입력으로 받지 않고, 코디네이터 개인키로 회로 안에서 직접 계산한다.
//   1) coordPub = coordPriv * Base8      -> 체인에 등록된 공개키의 진짜 개인키임을 증명
//   2) shared_i = coordPriv * ephPub_i   -> 공유키를 임의로 바꿀 수 없음 (표 누락/조작 차단)
//   3) candidateId_i = ciphertext_i - Poseidon(shared_i.x, shared_i.y)
//   4) 실제 표는 정확히 한 후보로 복호화되어야 함, 패딩 슬롯(ephPubX = 0)은 0표
//   5) 후보별 합계 == adminResult
template Tally(n, numCandidates) {
    // 비밀 입력
    signal input coordPriv;

    // 공개 입력
    signal input coordPubX;
    signal input coordPubY;
    signal input ciphertexts[n];
    signal input ephPubX[n];
    signal input ephPubY[n];
    signal input adminResult[numCandidates];

    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    // 1. 코디네이터 키 검증
    component privBits = Num2Bits(253);
    privBits.in <== coordPriv;
    component pubMul = EscalarMulFix(253, BASE8);
    for (var b = 0; b < 253; b++) {
        pubMul.e[b] <== privBits.out[b];
    }
    pubMul.out[0] === coordPubX;
    pubMul.out[1] === coordPubY;

    signal candidateIds[n];
    signal votes[n][numCandidates];
    signal validCount[n][numCandidates + 1];
    signal tallyAcc[numCandidates][n + 1];

    component shared[n];
    component ks[n];
    component eq[n][numCandidates];
    component isPad[n];

    for (var i = 0; i < n; i++) {
        // 2. 공유점 재계산
        shared[i] = EscalarMulAny(253);
        for (var b = 0; b < 253; b++) {
            shared[i].e[b] <== privBits.out[b];
        }
        shared[i].p[0] <== ephPubX[i];
        shared[i].p[1] <== ephPubY[i];

        // 3. 복호화
        ks[i] = Poseidon(2);
        ks[i].inputs[0] <== shared[i].out[0];
        ks[i].inputs[1] <== shared[i].out[1];
        candidateIds[i] <== ciphertexts[i] - ks[i].out;

        // 4. 후보 판별 + 무결성
        isPad[i] = IsZero();
        isPad[i].in <== ephPubX[i];
        validCount[i][0] <== 0;
        for (var c = 0; c < numCandidates; c++) {
            eq[i][c] = IsEqual();
            eq[i][c].in[0] <== candidateIds[i];
            eq[i][c].in[1] <== c;
            votes[i][c] <== eq[i][c].out;
            validCount[i][c + 1] <== validCount[i][c] + votes[i][c];
        }
        validCount[i][numCandidates] === 1 - isPad[i].out;
    }

    // 5. 합산 및 비교
    for (var c = 0; c < numCandidates; c++) {
        tallyAcc[c][0] <== 0;
        for (var i = 0; i < n; i++) {
            tallyAcc[c][i + 1] <== tallyAcc[c][i] + votes[i][c];
        }
        tallyAcc[c][n] === adminResult[c];
    }
}

component main {public [coordPubX, coordPubY, ciphertexts, ephPubX, ephPubY, adminResult]} = Tally(50, 5);
