pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template VoteProof() {
    // 비밀 입력
    signal input secret;
    signal input candidateId;

    // 공개 입력
    signal input maxCandidates;

    // 공개 출력
    signal output nullifier;

    // 1. nullifier 생성
    component pos = Poseidon(1);
    pos.inputs[0] <== secret;
    nullifier <== pos.out;

    // 2. 유효 범위 검증 (0 ~ maxCandidates)
    component gte = GreaterEqThan(8);
    gte.in[0] <== candidateId;
    gte.in[1] <== 0;
    gte.out === 1;

    component lte = LessEqThan(8);
    lte.in[0] <== candidateId;
    lte.in[1] <== maxCandidates;
    lte.out === 1;
}

component main {public [maxCandidates]} = VoteProof();
