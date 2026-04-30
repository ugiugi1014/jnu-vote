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

    // 컴포넌트 선언
    component pos[n];
    component n2b_ks[n];
    component n2b_ct[n];
    component b2n[n];
    component eq[n][numCandidates];

    for (var i = 0; i < n; i++) {
        // 1. keystream 재구성
        pos[i] = Poseidon(2);
        pos[i].inputs[0] <== sharedKeys[i];
        pos[i].inputs[1] <== nonces[i];
        keystreams[i] <== pos[i].out;

        // 2. 비트 분해
        n2b_ks[i] = Num2Bits(254);
        n2b_ks[i].in <== keystreams[i];

        n2b_ct[i] = Num2Bits(254);
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
    }

    // 6. 득표 합산 및 관리자 집계 결과와 비교
    for (var c = 0; c < numCandidates; c++) {
        var sum = 0;
        for (var i = 0; i < n; i++) {
            sum += votes[i][c];
        }
        tally[c] <== sum;
        tally[c] === adminResult[c];
    }
}

component main {public [nonces, ciphertexts, adminResult]} = Tally(10, 3);
