pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/escalarmulfix.circom";
include "../node_modules/circomlib/circuits/escalarmulany.circom";

// 집계 유효성 증명 (ZKP ②) — 배치 버전
// 표를 n개씩 배치로 나눠 배치마다 증명한다 (표 수 제한 없음, 배치 증명은 병렬 생성 가능).
// 배치 사이에는 누적 득표수를 공개하지 않고 커밋먼트 Poseidon(누적득표[5], salt) 만 넘긴다.
// 마지막 배치(isFinal = 1)에서만 최종 득표수를 공개한다.
// 공유키를 비공개 입력으로 받지 않고, 코디네이터 개인키로 회로 안에서 직접 계산한다.
//   1) coordPub = coordPriv * Base8      -> 체인에 등록된 공개키의 진짜 개인키임을 증명
//   2) shared_i = coordPriv * ephPub_i   -> 공유키를 임의로 바꿀 수 없음 (표 누락/조작 차단)
//   3) candidateId_i = ciphertext_i - Poseidon(shared_i.x, shared_i.y)
//   4) 실제 표는 정확히 한 후보로 복호화되어야 함, 패딩 슬롯(ephPubX = 0)은 0표
//   5) prevCommit = Poseidon(prevTally, prevSalt), newCommit = Poseidon(prevTally + 이번 배치, newSalt)
//   6) isFinal = 1 이면 result = 누적 득표수, 아니면 result = 0 (중간 결과 비공개)
template Tally(n, numCandidates) {
    // 비밀 입력
    signal input coordPriv;
    signal input prevTally[numCandidates];
    signal input prevSalt;
    signal input newSalt;

    // 공개 입력
    signal input coordPubX;
    signal input coordPubY;
    signal input ciphertexts[n];
    signal input ephPubX[n];
    signal input ephPubY[n];
    signal input prevCommit;
    signal input newCommit;
    signal input isFinal;
    signal input result[numCandidates];

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

    // 5. 누적 커밋먼트 검증
    component prevH = Poseidon(numCandidates + 1);
    for (var c = 0; c < numCandidates; c++) {
        prevH.inputs[c] <== prevTally[c];
    }
    prevH.inputs[numCandidates] <== prevSalt;
    prevH.out === prevCommit;

    signal newTally[numCandidates];
    component newH = Poseidon(numCandidates + 1);
    for (var c = 0; c < numCandidates; c++) {
        tallyAcc[c][0] <== prevTally[c];
        for (var i = 0; i < n; i++) {
            tallyAcc[c][i + 1] <== tallyAcc[c][i] + votes[i][c];
        }
        newTally[c] <== tallyAcc[c][n];
        newH.inputs[c] <== newTally[c];
    }
    newH.inputs[numCandidates] <== newSalt;
    newH.out === newCommit;

    // 6. 최종 배치에서만 결과 공개
    isFinal * (isFinal - 1) === 0;
    for (var c = 0; c < numCandidates; c++) {
        result[c] === isFinal * newTally[c];
    }
}

component main {public [coordPubX, coordPubY, ciphertexts, ephPubX, ephPubY, prevCommit, newCommit, isFinal, result]} = Tally(50, 5);
