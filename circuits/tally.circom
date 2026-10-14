pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template Tally(n, numCandidates) {
    // 비밀 입력
    signal input sharedKeys[n];

    // 공개 입력
    signal input nonces[n];
    signal input ciphertexts[n];
    signal input adminResult[numCandidates];

    // 내부 신호
    signal keystreams[n];
    signal xorBits[n][254];
    signal candidateIds[n];
    signal votes[n][numCandidates];
    signal tally[numCandidates];
    signal tallyAcc[numCandidates][n+1];
    signal validCount[n][numCandidates+1];
    signal isPad[n];

    // 컴포넌트 선언
    component pos[n];
    component n2b_ks[n];
    component n2b_ct[n];
    component b2n[n];
    component eq[n][numCandidates];
    component zNonce[n];
    component zCt[n];

    for (var i = 0; i < n; i++) {
        // 1. keystream 재구성
        pos[i] = Poseidon(2);
        pos[i].inputs[0] <== sharedKeys[i];
        pos[i].inputs[1] <== nonces[i];
        keystreams[i] <== pos[i].out;

        // 2. 비트 분해
        // Num2Bits(254)는 x와 x+p 두 가지 비트 분해를 허용(aliasing)하므로
        // 증명자가 다른 분해를 골라 복호화 결과를 바꿀 수 있다 -> strict 버전 사용
        n2b_ks[i] = Num2Bits_strict();
        n2b_ks[i].in <== keystreams[i];

        n2b_ct[i] = Num2Bits_strict();
        n2b_ct[i].in <== ciphertexts[i];

        // 3. XOR (254비트 전체)
        for (var b = 0; b < 254; b++) {
            xorBits[i][b] <== n2b_ct[i].out[b] + n2b_ks[i].out[b]
                             - 2 * n2b_ct[i].out[b] * n2b_ks[i].out[b];
        }

        // 4. 비트 재조합
        b2n[i] = Bits2Num(254);
        for (var b = 0; b < 254; b++) {
            b2n[i].in[b] <== xorBits[i][b];
        }
        candidateIds[i] <== b2n[i].out;

        // 5. 후보별 득표 집계
        for (var c = 0; c < numCandidates; c++) {
            eq[i][c] = IsEqual();
            eq[i][c].in[0] <== candidateIds[i];
            eq[i][c].in[1] <== c;
            votes[i][c] <== eq[i][c].out;
        }

        // 6. 무결성: 실제 표는 반드시 후보 0~(numCandidates-1) 중 하나로 복호화되어야 한다.
        //    (관리자가 잘못된 공유키를 넣어 표를 버리는 공격 차단)
        //    패딩 슬롯(nonce=0, ciphertext=0)만 어느 후보에도 해당하지 않을 수 있다.
        zNonce[i] = IsZero();
        zNonce[i].in <== nonces[i];
        zCt[i] = IsZero();
        zCt[i].in <== ciphertexts[i];
        isPad[i] <== zNonce[i].out * zCt[i].out;

        validCount[i][0] <== 0;
        for (var c = 0; c < numCandidates; c++) {
            validCount[i][c+1] <== validCount[i][c] + votes[i][c];
        }
        validCount[i][numCandidates] === 1 - isPad[i];
    }

    // 7. 득표 합산 및 관리자 집계 결과와 비교
    for (var c = 0; c < numCandidates; c++) {
        tallyAcc[c][0] <== 0;
        for (var i = 0; i < n; i++) {
            tallyAcc[c][i+1] <== tallyAcc[c][i] + votes[i][c];
        }
        tally[c] <== tallyAcc[c][n];
        tally[c] === adminResult[c];
    }
}

component main {public [nonces, ciphertexts, adminResult]} = Tally(50, 5);