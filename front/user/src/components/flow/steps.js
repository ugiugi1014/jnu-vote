import { BEATS } from "./beats";

// 작동 원리 화면의 단계 정의
//  nodes: 이번 단계에 관여하는 주체 (아는 것 표에서 강조), 재생 순서는 beats.js
//  knows: "누가 무엇을 아는가" 표 (✓ 아는 것, ✗ 모르는 것)
//  detail: '자세히 보기' (전문 용어는 여기에만), tryIt: 직접 해 보기 종류, attacks: 공격 시도 종류

export const ACTORS = [
  { id: "student", label: "학생 브라우저" },
  { id: "server", label: "서버" },
  { id: "chain", label: "블록체인" },
  { id: "outsider", label: "외부 관찰자" },
];

const RAW_STEPS = [
  {
    id: "login",
    title: "로그인",
    desc: "학교 웹메일로 받은 인증 코드로 로그인합니다. 비밀번호를 따로 만들 필요가 없고, 블록체인 지갑도 로그인할 때 자동으로 복원됩니다.",
    nodes: ["student", "server"],
    knows: {
      student: ["✓ 내 웹메일"],
      server: ["✓ 웹메일 (누가 로그인했는지)"],
      chain: ["✗ 아직 아무것도 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["인증", "웹메일로 6자리 코드 발송 → 확인 후 JWT 발급"],
      ["지갑", "웹메일 + 서버 시크릿으로 만든 인앱 지갑 (키 관리 불필요, 기기에 저장 안 함)"],
    ],
  },
  {
    id: "verify",
    title: "재학 인증 (처음 한 번)",
    desc: "재학증명서를 올리면 서버가 문서 번호를 읽고, 발급 기관에 진짜 증명서인지 확인합니다. 한 번 인증하면 다음부터는 하지 않습니다.",
    nodes: ["student", "server"],
    knows: {
      student: ["✓ 내 학번"],
      server: ["✓ 학번 · 웹메일 연결", "✓ 재학 여부"],
      chain: ["✗ 아직 아무것도 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["글자 읽기", "서버에서 OCR 로 학번·문서번호 추출 (OCR 키는 브라우저에 두지 않음)"],
      ["진위 확인", "KICA 재학증명 진위확인. 오류 시 관리자 수동 승인 대기"],
      ["중복 방지", "같은 문서번호는 한 계정에서만 사용 가능"],
    ],
  },
  {
    id: "key",
    title: "투표권 만들기",
    desc: "투표 화면에 들어가면 이 선거 명단에 있는지 확인한 뒤, 브라우저가 나만 아는 투표권를 만듭니다. 서버에는 이 투표권을 암호화한 값만 보냅니다.",
    nodes: ["student", "server"],
    knows: {
      student: ["✓ 투표권 (나만 앎)"],
      server: ["✓ 이 학생의 암호화된 투표권", "✗ 투표권"],
      chain: ["✗ 아직 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["seed (고유값)", "패스키(PRF) 또는 복구 코드에서 얻음 — 서버는 계산할 수 없음"],
      ["secret (투표권)", "Poseidon(seed, 선거 주소) — 선거마다 다름"],
      ["commitment (암호화된 투표권)", "Poseidon(secret) — 해시라서 secret 을 되돌릴 수 없음"],
    ],
    tryIt: "key",
  },
  {
    id: "register",
    title: "유권자 명단에 등록",
    desc: "서버가 암호화된 투표권를 블록체인의 유권자 명단에 올립니다. 명단에는 학번이 없어서, 명단을 봐도 누구의 것인지 알 수 없습니다.",
    nodes: ["server", "chain"],
    knows: {
      student: ["✓ 투표권"],
      server: ["✓ 학번 ↔ 암호화된 투표권"],
      chain: ["✓ 암호화된 투표권 목록", "✗ 누구의 것인지"],
      outsider: ["✓ 암호화된 투표권 목록", "✗ 누구의 것인지"],
    },
    detail: [
      ["머클 트리", "깊이 16 (최대 65,536명), Poseidon 해시, 체인에서 직접 계산"],
      ["명단 root (명단 요약값)", "투표 증명이 '이 명단 안의 누군가'임을 증명할 때 쓰는 값"],
    ],
  },
  {
    id: "encrypt",
    title: "투표 내용 잠그기",
    desc: "후보를 고르면 블록체인에 고정된 관리자 공개키로 투표 내용을 잠급니다. 잠긴 투표 내용은 관리자 개인키로만 열 수 있습니다.",
    nodes: ["student", "chain"],
    knows: {
      student: ["✓ 내가 고른 후보"],
      server: ["✗ 후보"],
      chain: ["✗ 아직 표 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["임시 키", "ephPriv(투표마다 새로) → ephPub = ephPriv × Base8"],
      ["공유키", "ephPriv × 코디네이터 공개키 (BabyJubJub ECDH)"],
      ["암호문", "후보 번호 + Poseidon(공유키) mod p"],
      ["코디네이터 공개키", "선거 시작 때 체인에 고정 — 관리자가 학생마다 다른 키를 줄 수 없음"],
    ],
    tryIt: "encrypt",
  },
  {
    id: "prove",
    title: "유효한 투표인지 증명하기",
    desc: "브라우저가 투표 내용을 보여 주지 않고, 유효한 투표인지 증명합니다. 명단에 있는 사람이, 실제 후보 중 하나를, 정해진 열쇠로 잠갔다는 것만 드러나고 누구인지와 어느 후보인지는 드러나지 않습니다.",
    nodes: ["student"],
    knows: {
      student: ["✓ 증명 + 공개 값"],
      server: ["✗ 아직 받지 않음"],
      chain: ["✗ 아직 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["영지식 증명", "Groth16, voteProof.circom, 7,682 제약"],
      ["비공개 입력", "secret, 명단 경로, 후보 번호, 임시 키"],
      ["공개 값 9개", "nullifier, 명단 root, 선거 주소, 후보 수, 코디네이터 공개키 x·y, 암호문, 임시 공개키 x·y"],
      ["nullifier (중복투표방지)", "Poseidon(secret, 선거 주소) — 같은 학생은 같은 값, 다른 학생과는 안 겹침"],
    ],
    tryIt: "prove",
  },
  {
    id: "submit",
    title: "투표 제출",
    desc: "증명과 잠긴 투표 내용을 로그인 없이 서버에 보내면, 서버가 블록체인에 대신 제출합니다. 블록체인이 증명을 확인하고, 이미 투표한 사람이면 거절합니다.",
    nodes: ["student", "server", "chain"],
    knows: {
      student: ["✓ 내 표"],
      server: ["✓ 잠긴 투표 내용", "✓ 요청 IP · 시간 (기록하지 않는다고 가정)", "✗ 누가 보냈는지"],
      chain: ["✓ 잠긴 투표 내용 · 중복투표방지 값", "✗ 누구의 표인지", "✗ 후보"],
      outsider: ["✓ 잠긴 투표 내용", "✗ 누구 · 후보"],
    },
    detail: [
      ["relay (대신 제출)", "학생 지갑·토큰·가스 불필요. 제출 전 staticCall 로 미리 검증"],
      ["검사 순서", "nullifier 중복 → 명단 root(최근 30개) → 증명 검증 → 저장"],
      ["신뢰 가정", "대신 제출하는 쪽이 서버라서, 서버가 IP·시간으로 추측하지 않는다고 가정"],
    ],
    attacks: ["double", "outsider"],
  },
  {
    id: "tally",
    title: "개표와 개표 증명",
    desc: "투표가 끝나면 관리자가 개인키로 표를 풀어 세고, '블록체인의 모든 표를 빠짐없이 정확히 셌다'는 증명을 함께 올립니다. 표를 빼거나 바꾸면 증명이 통과하지 못합니다.",
    nodes: ["server", "chain"],
    knows: {
      student: ["✓ 결과"],
      server: ["✓ 개별 표 내용 (관리자 개인키)", "✗ 누구의 표인지"],
      chain: ["✓ 최종 득표 + 확인된 개표 증명"],
      outsider: ["✓ 최종 득표", "✓ 증명이 블록체인에서 확인됨"],
    },
    detail: [
      ["회로 안에서 계산", "공유키 = 코디네이터 개인키 × 임시 공개키 (관리자가 가짜 공유키를 넣을 수 없음)"],
      ["키 확인", "코디네이터 개인키 × Base8 = 체인에 고정된 공개키 인지 확인"],
      ["배치", "50표씩 증명 (recordTallyBatch), 회로 129,140 제약"],
      ["개표 후", "코디네이터 개인키 폐기"],
    ],
    attacks: ["tally"],
  },
  {
    id: "summary",
    title: "정리: 무엇이 보장되나",
    desc: "개표가 정확한지는 누구나 블록체인에서 확인할 수 있습니다. 표 내용의 비밀은 관리자를 믿어야 합니다. 열쇠를 여러 사람이 나눠 갖는 방식은 향후 과제입니다.",
    nodes: ["student", "server", "chain"],
    knows: {
      student: ["✓ 내 표가 들어갔는지"],
      server: ["✓ 개별 표 내용 (믿어야 하는 부분)", "✗ 누구의 표인지"],
      chain: ["✓ 모든 잠긴 표 · 최종 득표 · 증명"],
      outsider: ["✓ 개표가 맞는지 확인 가능"],
    },
    summary: true,
    stageNote: "세 주체가 각각 하는 일을 정리했습니다. 오른쪽에서 무엇이 확인으로 보장되고 무엇을 믿어야 하는지 보세요.",
  },
];

export const STEPS = RAW_STEPS.map((s) => ({ ...s, beats: BEATS[s.id] || [] }));
