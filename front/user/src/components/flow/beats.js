// 단계별 재생 순서
//  { at, text, f, val|value, note }       : 그 주체 안에서 하는 일 (text = 쉬운 말, f = 공식/함수 이름, '공식 보기'를 켜면 보임)
//  { send: [보내는 쪽, 받는 쪽], text, f, val|value, note } : 네트워크로 오가는 데이터
//  val = 페이지가 미리 계산해 둔 실제 값 이름, value = 정해진 글
//  ok: true/false 면 결과 값을 초록/빨강으로
//  app: 그 순간 학생 휴대폰 화면 (AppPhone.jsx 의 화면 이름과 상태)
export const BEATS = {
  login: [
    { app: { s: "login", email: true }, at: "student", text: "학교 웹메일 입력", value: "20260001@stu.jejunu.ac.kr", note: "학교 웹메일 주소를 넣습니다." },
    { app: { s: "login", email: true, tap: "send" }, send: ["student", "server"], text: "웹메일 주소", value: "20260001@stu…", note: "서버가 이 주소로 인증 코드를 보냅니다." },
    { app: { s: "code", tap: "login" }, at: "server", text: "인증 코드 확인", value: "일치", ok: true, note: "메일로 받은 코드가 맞는지 확인합니다." },
    { app: { s: "code", busy: "로그인 중" }, at: "server", text: "블록체인 지갑 복원", f: "HKDF(웹메일 + 서버 시크릿)", value: "매번 같은 지갑", note: "학생이 지갑을 따로 관리하지 않아도 로그인할 때마다 같은 지갑이 만들어집니다." },
    { app: { s: "list", unverified: true }, send: ["server", "student"], text: "로그인 완료", f: "JWT", value: "로그인 토큰", note: "로그인됐습니다. 아직 재학 인증 전입니다." },
  ],
  verify: [
    { app: { s: "upload" }, at: "student", text: "재학증명서 사진 올리기", value: "재학증명서.jpg", note: "처음 한 번만 합니다." },
    { app: { s: "upload", tap: "upload" }, send: ["student", "server"], text: "재학증명서 사진", value: "재학증명서.jpg", note: "사진은 서버로 갑니다." },
    { app: { s: "upload", busy: "글자 읽는 중" }, at: "server", text: "학번 · 문서 번호 읽기", f: "OCR", value: "20260001 · 1234-5678-…", note: "서버가 사진에서 학번과 문서 번호를 읽어 화면에 채워 줍니다." },
    { app: { s: "upload", filled: true, tap: "request" }, at: "server", text: "다른 계정에서 쓴 증명서인지", value: "처음 사용", ok: true, note: "같은 증명서로 여러 계정을 인증할 수 없습니다." },
    { app: { s: "upload", filled: true, busy: "진위 확인 중" }, at: "server", text: "발급 기관에 진짜인지 확인", f: "KICA 진위확인", value: "재학 중", ok: true, note: "문서 번호로 실제 발급된 재학증명서인지 확인합니다. 확인이 안 되면 관리자가 직접 승인합니다." },
    { app: { s: "list" }, send: ["server", "student"], text: "재학 인증 완료", value: "학번 20260001", note: "이제 이 학번이 들어간 선거에 투표할 수 있습니다." },
  ],
  key: [
    { app: { s: "list", tap: "vote" }, at: "server", text: "이 선거 명단에 내 학번이 있는지", value: "있음", ok: true, note: "투표 화면에 들어가면 관리자가 올린 학번 명단과 비교합니다." },
    { app: { s: "key", tap: "passkey" }, at: "student", text: "패스키로 고유값 얻기", f: "seed (패스키 PRF 또는 복구 코드)", val: ["seed"], note: "기기의 패스키(지문·얼굴 인증)로 나만 다시 얻을 수 있는 고유값을 만듭니다." },
    { app: { s: "key", busy: "만드는 중" }, at: "student", text: "투표권 만들기", f: "secret = Poseidon(seed, 선거 주소)", val: ["secret"], note: "선거마다 다른 투표권입니다. 브라우저 밖으로 나가지 않습니다." },
    { app: { s: "key", busy: "만드는 중" }, at: "student", text: "투표권을 암호화", f: "commitment = Poseidon(secret)", val: ["commitment"], note: "암호화된 값에서 원래 투표권을 되돌릴 수 없습니다." },
    { app: { s: "key", busy: "등록 중" }, send: ["student", "server"], text: "암호화된 투표권", f: "commitment", val: ["commitment"], note: "투표권이 아니라 암호화된 값만 서버로 갑니다." },
    { app: { s: "key", busy: "등록 중" }, at: "server", text: "이 학번이 이미 등록했는지", value: "처음", ok: true, note: "한 학번은 선거마다 한 번만 등록할 수 있습니다. 1인 1표의 첫 번째 장치입니다." },
  ],
  register: [
    { app: { s: "key", busy: "등록 중" }, at: "server", text: "등록 시각만 기록", value: "암호화된 투표권는 저장 안 함", note: "서버에는 '이 학번이 등록했다'만 남습니다." },
    { app: { s: "key", busy: "등록 중" }, send: ["server", "chain"], text: "유권자 명단에 올리기", f: "registerVoter(commitment)", val: ["commitment"], note: "블록체인 명단에 암호화된 투표권만 올라갑니다. 학번은 올라가지 않습니다." },
    { app: { s: "key", busy: "등록 중" }, at: "chain", text: "명단에 추가", f: "머클 트리, 깊이 16", value: "최대 65,536명", note: "블록체인이 직접 명단을 관리합니다." },
    { app: { s: "ready" }, at: "chain", text: "명단 요약값 새로 계산", f: "머클 root", val: ["root"], note: "명단 전체를 대표하는 값 하나입니다. 투표할 때 '이 명단 안에 내가 있다'를 증명하는 데 씁니다." },
    { app: { s: "ready" }, at: "chain", text: "최근 요약값 30개 보관", value: "등록이 이어져도 투표가 안 깨짐", note: "투표 중에 다른 학생이 등록해 요약값이 바뀌어도 직전 값으로 낸 표가 인정됩니다." },
  ],
  encrypt: [
    { app: { s: "ready" }, send: ["chain", "student"], text: "관리자 공개키", f: "코디네이터 공개키 (x, y)", val: ["coordX"], note: "선거 시작 때 블록체인에 고정된 공개키를 브라우저가 직접 읽습니다. 서버가 바꿔치기할 수 없습니다." },
    { app: { s: "ready", sel: 1, tap: "cand" }, at: "student", text: "후보 고르기", val: ["candidate"], note: "고른 후보는 이 브라우저만 압니다." },
    { app: { s: "voting", stage: 0, tapVote: true }, at: "student", text: "투표용 일회용 열쇠 만들기", f: "ephPub = ephPriv × Base8", val: ["ephPubX"], note: "투표할 때마다 새로 만드는 열쇠입니다." },
    { app: { s: "voting", stage: 0 }, at: "student", text: "관리자만 여는 자물쇠 만들기", f: "공유키 = ephPriv × 관리자 공개키 (ECDH)", value: "브라우저 안에만 있음", note: "관리자 개인키를 가진 쪽만 같은 자물쇠를 다시 만들어 열 수 있습니다." },
    { app: { s: "voting", stage: 0 }, at: "student", text: "완료된 투표 내용을 자물쇠로 잠그기", f: "암호문 = 후보 번호 + Poseidon(공유키)", val: ["ciphertext"], note: "잠긴 값만 봐서는 어느 후보인지 알 수 없습니다." },
  ],
  prove: [
    { app: { s: "voting", stage: 1 }, at: "student", text: "명단에서 내 위치 찾기", f: "머클 경로 (commitment → root)", val: ["root"], note: "블록체인의 명단을 받아, 내 값에서 명단 요약값까지 이어지는 경로를 구합니다." },
    { app: { s: "voting", stage: 1 }, at: "student", text: "중복투표방지", f: "nullifier = Poseidon(secret, 선거 주소)", val: ["nullifier"], note: "같은 사람이면 몇 번을 투표해도 같은 값이 나옵니다. 두 번째 표는 이 값 때문에 거절됩니다." },
    { app: { s: "voting", stage: 1, progress: true }, at: "student", text: "투표 내용을 보여 주지 않고, 유효한 투표인지 증명하기", f: "영지식 증명 (Groth16, 7,682 제약)", value: "약 5초", note: "투표권·후보·열쇠는 넣기만 하고 밖으로 드러나지 않습니다." },
    { app: { s: "voting", stage: 1 }, at: "student", text: "증명되는 것", value: "명단에 있는 사람 · 실제 후보 중 하나 · 정해진 열쇠로 잠금", ok: true, note: "누구인지와 어느 후보인지는 빼고, 유효한 투표라는 사실만 증명합니다." },
  ],
  submit: [
    { app: { s: "voting", stage: 2 }, send: ["student", "server"], text: "증명 + 잠긴 투표 내용", f: "/vote/relay (로그인 토큰 없음)", val: ["nullifier"], note: "로그인 없이 보냅니다. 서버는 계정으로는 누가 보냈는지 알 수 없습니다." },
    { app: { s: "voting", stage: 2 }, at: "server", text: "제출 전에 미리 시험", f: "staticCall", value: "통과", ok: true, note: "잘못된 표로 수수료를 낭비하지 않게 먼저 시험해 봅니다." },
    { app: { s: "voting", stage: 2 }, send: ["server", "chain"], text: "블록체인에 표 제출", f: "castVote(...)", val: ["ciphertext"], note: "서버가 대신 제출합니다. 학생은 지갑·수수료가 필요 없습니다." },
    { app: { s: "voting", stage: 2 }, at: "chain", text: "이미 투표한 사람인가", f: "nullifier 중복 확인", value: "아니오", ok: true, note: "같은 중복투표방지 값이 있으면 여기서 거절됩니다." },
    { app: { s: "voting", stage: 2 }, at: "chain", text: "명단에 있는 사람인가", f: "root 가 최근 30개 안에 있는지", value: "예", ok: true, note: "명단에 없는 사람의 증명은 여기서 거절됩니다." },
    { app: { s: "voting", stage: 2 }, at: "chain", text: "증명 확인", f: "VoteVerifier.verifyProof", value: "통과", ok: true, note: "블록체인이 증명을 직접 확인합니다." },
    { app: { s: "voted" }, at: "chain", text: "잠긴 투표 내용 저장", f: "암호문 · nullifier 저장", val: ["ciphertext"], note: "블록체인에는 누가 냈는지도, 어느 후보인지도 없는 잠긴 값만 남습니다." },
  ],
  tally: [
    { app: { s: "closed" }, at: "server", text: "투표 종료", f: "closeElection()", value: "더 이상 표를 받지 않음", note: "블록체인에서 선거가 닫힙니다." },
    { app: { s: "closed" }, send: ["chain", "server"], text: "블록체인의 잠긴 표 전부", value: "표 n개", note: "개표는 서버에 따로 둔 표가 아니라 블록체인에 있는 표를 그대로 씁니다." },
    { app: { s: "closed" }, at: "server", text: "관리자 개인키로 표 열기 · 세기", f: "코디네이터 개인키로 복호화", value: "예) 기호 0: 3 · 기호 1: 3 · 기호 2: 2", note: "여기서 관리자는 표 내용을 볼 수 있습니다. 누가 낸 표인지는 모릅니다." },
    { app: { s: "closed" }, at: "server", text: "빠짐없이 정확히 셌다는 증명 만들기", f: "개표 영지식 증명 (50표씩, 129,140 제약)", value: "증명 안에서 자물쇠를 직접 다시 만듦", note: "관리자가 표를 빼거나 다른 열쇠를 넣으면 증명이 만들어지지 않습니다." },
    { app: { s: "closed" }, send: ["server", "chain"], text: "증명 + 득표", f: "recordTallyBatch(...)", value: "공개 값 160개", note: "증명과 득표를 블록체인에 올립니다." },
    { app: { s: "closed" }, at: "chain", text: "블록체인의 표로 셌는지", f: "증명 입력 = 저장된 암호문·공개키", value: "일치", ok: true, note: "다른 표로 증명하면 여기서 거절됩니다." },
    { app: { s: "closed" }, at: "chain", text: "개표 증명 확인", f: "TallyVerifier.verifyProof", value: "통과", ok: true, note: "표를 빼거나 득표를 바꾸면 통과하지 못합니다." },
    { app: { s: "result" }, at: "chain", text: "최종 득표 기록", value: "누구나 조회 가능", note: "결과가 블록체인에 남습니다." },
    { app: { s: "result" }, at: "server", text: "관리자 개인키 폐기", value: "삭제", note: "개표가 끝나면 열쇠를 지웁니다." },
  ],
};
