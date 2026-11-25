import { BEATS } from "./beats";

// 작동 원리 화면의 단계 정의
//  nodes: 이번 단계에 관여하는 주체 (아는 것 표에서 강조), 재생 순서는 beats.js
//  knows: "누가 무엇을 아는가" 표 (✓ 아는 것, ✗ 모르는 것)
//  detail: '자세히 보기'에 나오는 항목, tryIt: 직접 해 보기 종류, attacks: 공격 시도 종류

export const ACTORS = [
  { id: "student", label: "학생 브라우저" },
  { id: "server", label: "서버 (relay)" },
  { id: "chain", label: "블록체인" },
  { id: "outsider", label: "외부 관찰자" },
];

const RAW_STEPS = [
  {
    id: "login",
    title: "로그인과 재학 인증",
    desc: "학교 웹메일로 로그인하고 재학증명서로 재학 여부를 확인합니다. 서버는 이 학생이 누구인지(학번)와 이 선거의 명단에 있는지를 확인합니다.",
    nodes: ["student", "server"],
    knows: {
      student: ["✓ 내 학번"],
      server: ["✓ 학번 · 이메일", "✓ 명단 포함 여부"],
      chain: ["✗ 아직 아무것도 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["재학 확인", "KICA 재학증명 진위확인 + 선거별 학번 명단"],
      ["지갑", "웹메일 + 서버 시크릿으로 만든 인앱 지갑 (키 관리 불필요)"],
    ],
  },
  {
    id: "key",
    title: "투표 키 만들기",
    desc: "학생 브라우저가 나만 아는 비밀값(secret)을 만들고, 그 해시(commitment)만 서버에 보냅니다. secret 은 브라우저 밖으로 나가지 않습니다.",
    nodes: ["student", "server"],
    knows: {
      student: ["✓ secret (나만 앎)"],
      server: ["✓ 이 학생의 commitment", "✗ secret"],
      chain: ["✗ 아직 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["seed", "패스키(PRF) 또는 복구 코드에서 얻음 — 서버는 계산할 수 없음"],
      ["secret", "Poseidon(seed, 선거 주소) — 선거마다 다름"],
      ["commitment", "Poseidon(secret) — 해시라서 secret 을 되돌릴 수 없음"],
    ],
    tryIt: "key",
  },
  {
    id: "register",
    title: "유권자 명단에 등록",
    desc: "서버가 학번·자격을 확인한 뒤 commitment 를 체인의 유권자 명단(머클 트리)에 올립니다. 체인에는 학번이 없어서, 명단을 봐도 누구의 키인지 알 수 없습니다.",
    nodes: ["server", "chain"],
    knows: {
      student: ["✓ secret"],
      server: ["✓ 학번 ↔ commitment 연결"],
      chain: ["✓ commitment 목록", "✗ 누구의 키인지"],
      outsider: ["✓ commitment 목록", "✗ 누구의 키인지"],
    },
    detail: [
      ["머클 트리", "깊이 16 (최대 65,536명), Poseidon 해시, 체인에서 직접 계산"],
      ["명단 root", "투표 증명이 '이 root 안의 누군가'임을 증명할 때 쓰는 값"],
    ],
  },
  {
    id: "encrypt",
    title: "투표 암호화",
    desc: "체인에 고정된 관리자(코디네이터) 공개키로 고른 후보를 암호화합니다. 이 암호문은 코디네이터 개인키로만 열 수 있습니다.",
    nodes: ["student", "chain"],
    knows: {
      student: ["✓ 내가 고른 후보"],
      server: ["✗ 후보"],
      chain: ["✗ 아직 표 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["임시 키", "ephPriv(투표마다 새로) → ephPub = ephPriv × Base8"],
      ["공유키", "ephPriv × 코디 공개키 (BabyJubJub ECDH)"],
      ["암호문", "후보 번호 + Poseidon(공유키) mod p"],
      ["코디 공개키", "선거 시작 때 체인에 고정 — 관리자가 학생마다 다른 키를 줄 수 없음"],
    ],
    tryIt: "encrypt",
  },
  {
    id: "prove",
    title: "투표 증명 만들기",
    desc: "브라우저가 영지식 증명을 만듭니다. '명단 안의 누군가가, 유효한 후보 하나를, 체인에 고정된 키로 암호화했다'를 증명하지만, 누구인지와 어느 후보인지는 드러나지 않습니다.",
    nodes: ["student"],
    knows: {
      student: ["✓ 증명 + 공개 값 9개"],
      server: ["✗ 아직 받지 않음"],
      chain: ["✗ 아직 없음"],
      outsider: ["✗ 없음"],
    },
    detail: [
      ["비공개 입력", "secret, 명단 경로, 후보 번호, 임시 키"],
      ["공개 값 9개", "nullifier, 명단 root, 선거 주소, 후보 수, 코디 공개키 x·y, 암호문, 임시 공개키 x·y"],
      ["nullifier", "Poseidon(secret, 선거 주소) — 같은 학생은 같은 값, 다른 학생과는 안 겹침"],
      ["회로", "voteProof.circom, 7,682 제약, Groth16"],
    ],
    tryIt: "prove",
  },
  {
    id: "submit",
    title: "제출과 체인 기록",
    desc: "증명과 암호문을 로그인 없이 서버(relay)에 보내면, 서버 지갑이 체인에 대신 제출합니다. 컨트랙트가 증명을 검증하고, 이미 쓰인 nullifier 면 거절합니다.",
    nodes: ["student", "server", "chain"],
    knows: {
      student: ["✓ 내 표"],
      server: ["✓ 암호문", "✓ 요청 IP · 시간 (기록하지 않는다고 가정)", "✗ 어느 commitment 인지"],
      chain: ["✓ 암호문 · nullifier", "✗ 누구의 표인지", "✗ 후보"],
      outsider: ["✓ 암호문 · nullifier", "✗ 누구 · 후보"],
    },
    detail: [
      ["relay", "학생 지갑·토큰·가스 불필요. 제출 전 staticCall 로 미리 검증"],
      ["신뢰 가정", "relay 가 서버라서, 서버가 IP·시간으로 추측하지 않는다고 가정"],
    ],
    attacks: ["double", "outsider"],
  },
  {
    id: "tally",
    title: "개표와 개표 증명",
    desc: "투표가 끝나면 관리자가 코디네이터 개인키로 표를 풀어 세고, '체인의 모든 표를 빠짐없이 정확히 셌다'는 증명을 체인에 제출합니다. 표를 빼거나 바꾸면 증명이 통과하지 못합니다.",
    nodes: ["server", "chain"],
    knows: {
      student: ["✓ 결과"],
      server: ["✓ 개별 표 내용 (코디 개인키)", "✗ 누구의 표인지"],
      chain: ["✓ 최종 득표 + 검증된 개표 증명"],
      outsider: ["✓ 최종 득표", "✓ 증명이 체인에서 검증됨"],
    },
    detail: [
      ["회로 안에서 계산", "공유키 = 코디 개인키 × 임시 공개키 (관리자가 가짜 공유키를 넣을 수 없음)"],
      ["키 확인", "코디 개인키 × Base8 = 체인에 고정된 공개키 인지 확인"],
      ["배치", "50표씩 증명, 회로 129,140 제약"],
      ["개표 후", "코디 개인키 폐기"],
    ],
    attacks: ["tally"],
  },
  {
    id: "summary",
    title: "정리: 무엇이 보장되나",
    desc: "집계가 정확한지는 누구나 체인에서 검증할 수 있습니다. 표 내용의 비밀은 관리자(코디네이터)를 신뢰합니다. 키를 여러 사람이 나눠 갖는 방식은 향후 과제입니다.",
    nodes: ["student", "server", "chain"],
    knows: {
      student: ["✓ 내 표가 들어갔는지 (nullifier)"],
      server: ["✓ 개별 표 내용 (신뢰 필요)", "✗ 누구의 표인지"],
      chain: ["✓ 모든 표(암호문) · 최종 득표 · 증명"],
      outsider: ["✓ 집계가 맞는지 검증 가능"],
    },
    summary: true,
    stageNote: "세 주체가 각각 하는 일을 정리했습니다. 오른쪽에서 무엇이 검증으로 보장되고 무엇을 믿어야 하는지 보세요.",
  },
];

export const STEPS = RAW_STEPS.map((s) => ({ ...s, beats: BEATS[s.id] || [] }));
