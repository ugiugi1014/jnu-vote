// 단계별 재생 순서
//  { at, text, val|value, note }       : 그 주체 안에서 하는 계산 (val = 실제 값 이름, 페이지가 계산해 둔 값)
//  { send: [보내는 쪽, 받는 쪽], text, val|value, note } : 네트워크로 오가는 데이터
//  ok: true/false 면 결과 값을 초록/빨강으로
export const BEATS = {
  login: [
    { at: "student", text: "학교 웹메일 입력", value: "20260001@stu.jejunu.ac.kr", note: "학교 웹메일 주소를 넣습니다." },
    { send: ["student", "server"], text: "웹메일 주소", value: "20260001@stu…", note: "서버가 이 주소로 인증 코드를 보냅니다." },
    { at: "server", text: "인증 코드 확인", value: "일치", ok: true, note: "메일로 받은 코드를 입력하면 서버가 맞는지 확인합니다." },
    { at: "server", text: "재학증명서 진위 확인 (KICA)", value: "재학 중", ok: true, note: "재학증명서의 문서 번호로 진짜인지 확인합니다. (처음 한 번)" },
    { at: "server", text: "이 선거 학번 명단에 있는지", value: "있음", ok: true, note: "선거마다 관리자가 올린 학번 명단과 비교합니다." },
    { send: ["server", "student"], text: "로그인 토큰", value: "eyJhbGciOi…", note: "로그인됐습니다. 여기까지는 서버가 '누구인지' 압니다." },
  ],
  key: [
    { at: "student", text: "seed 만들기 (패스키 또는 복구 코드)", val: ["seed"], note: "기기의 패스키나 복구 코드에서 나만 다시 만들 수 있는 값을 얻습니다." },
    { at: "student", text: "secret = Poseidon(seed, 선거 주소)", val: ["secret"], note: "선거마다 다른 비밀값. 브라우저 밖으로 나가지 않습니다." },
    { at: "student", text: "commitment = Poseidon(secret)", val: ["commitment"], note: "secret 의 해시. 이것만으로 secret 을 되돌릴 수 없습니다." },
    { send: ["student", "server"], text: "commitment", val: ["commitment"], note: "secret 이 아니라 해시값만 서버로 갑니다." },
    { at: "server", text: "이 학번이 이미 등록했는지", value: "처음", ok: true, note: "한 학번은 선거마다 한 번만 등록할 수 있습니다. 이게 '1인 1표'의 첫 번째 장치입니다." },
  ],
  register: [
    { at: "server", text: "등록 시각만 DB에 기록", value: "commitment 값은 저장 안 함", note: "서버 DB에는 '이 학번이 등록했다'만 남습니다." },
    { send: ["server", "chain"], text: "registerVoter(commitment)", val: ["commitment"], note: "서버 지갑이 체인의 유권자 명단에 commitment 를 올립니다. 학번은 안 올라갑니다." },
    { at: "chain", text: "명단 트리에 commitment 추가", value: "깊이 16 (최대 65,536명)", note: "명단은 머클 트리입니다. 체인이 직접 해시를 계산합니다." },
    { at: "chain", text: "새 명단 root 계산", val: ["root"], note: "명단 전체를 대표하는 값 하나. 투표 증명은 '이 root 안에 내가 있다'를 증명합니다." },
    { at: "chain", text: "최근 root 30개 보관", value: "등록이 이어져도 투표가 안 깨지게", note: "투표 중에 다른 학생이 등록해 root 가 바뀌어도 직전 root 로 낸 표가 인정됩니다." },
  ],
  encrypt: [
    { send: ["chain", "student"], text: "코디네이터 공개키 (x, y)", val: ["coordX"], note: "선거 시작 때 체인에 고정된 공개키를 브라우저가 직접 읽습니다. 서버가 바꿔치기할 수 없습니다." },
    { at: "student", text: "후보 고르기", val: ["candidate"], note: "고른 후보는 이 브라우저만 압니다." },
    { at: "student", text: "임시 키 만들기 → ephPub = ephPriv × Base8", val: ["ephPubX"], note: "투표할 때마다 새로 만드는 일회용 키입니다." },
    { at: "student", text: "공유키 = ephPriv × 코디 공개키", value: "(브라우저 안에만 있음)", note: "타원곡선 Diffie-Hellman. 코디 개인키를 가진 쪽만 같은 공유키를 계산할 수 있습니다." },
    { at: "student", text: "암호문 = 후보 번호 + Poseidon(공유키)", val: ["ciphertext"], note: "후보 번호에 공유키에서 나온 값을 더해 가립니다." },
  ],
  prove: [
    { at: "student", text: "명단 경로 계산 (내 commitment → root)", val: ["root"], note: "체인의 명단을 받아 내 commitment 에서 root 까지 가는 경로를 구합니다." },
    { at: "student", text: "nullifier = Poseidon(secret, 선거 주소)", val: ["nullifier"], note: "같은 학생이면 몇 번을 투표해도 같은 값이 나옵니다. 이중 투표를 막는 표식입니다." },
    { at: "student", text: "영지식 증명 만들기 (Groth16)", value: "π · 약 5초 · 7,682 제약", note: "비밀값(secret·경로·후보·임시 키)은 넣기만 하고 드러내지 않습니다." },
    { at: "student", text: "증명이 보장하는 것", value: "명단 안의 누군가 · 유효 후보 · 고정된 키로 암호화", ok: true, note: "누구인지와 어느 후보인지는 빼고, 규칙을 지켰다는 사실만 증명합니다." },
  ],
  submit: [
    { send: ["student", "server"], text: "증명 + 암호문 + nullifier", val: ["nullifier"], note: "로그인 토큰 없이 보냅니다. 서버는 누가 보냈는지 계정으로는 알 수 없습니다." },
    { at: "server", text: "staticCall 로 미리 검증", value: "통과", ok: true, note: "잘못된 표로 가스를 낭비하지 않게 먼저 시험해 봅니다." },
    { send: ["server", "chain"], text: "castVote(...)", val: ["ciphertext"], note: "서버 지갑이 대신 제출합니다. 학생은 지갑·가스가 필요 없습니다." },
    { at: "chain", text: "이미 쓰인 nullifier 인가", value: "아니오", ok: true, note: "같은 nullifier 가 있으면 여기서 거절됩니다 (이중 투표)." },
    { at: "chain", text: "명단 root 가 최근 30개 안에 있나", value: "예", ok: true, note: "명단에 없는 사람의 증명은 여기서 거절됩니다." },
    { at: "chain", text: "투표 증명 검증", value: "통과", ok: true, note: "체인의 검증 컨트랙트가 증명을 직접 확인합니다." },
    { at: "chain", text: "암호문 · nullifier 저장", val: ["ciphertext"], note: "체인에는 누가 냈는지도, 어느 후보인지도 없는 암호문만 남습니다." },
  ],
  tally: [
    { at: "server", text: "투표 종료 (closeElection)", value: "더 이상 표를 받지 않음", note: "체인에서 선거가 닫힙니다." },
    { send: ["chain", "server"], text: "체인에 쌓인 암호문 전부", value: "암호문 n개 + 임시 공개키", note: "개표는 서버 DB가 아니라 체인에 있는 표를 그대로 씁니다." },
    { at: "server", text: "코디 개인키로 복호화 · 집계", value: "예) 기호 0: 2 · 기호 1: 3 · 기호 2: 1", note: "여기서 관리자는 개별 표 내용을 볼 수 있습니다. 누가 낸 표인지는 모릅니다." },
    { at: "server", text: "개표 증명 만들기 (50표씩)", value: "회로 안에서 공유키 직접 계산", note: "회로가 코디 개인키로 모든 표를 직접 풀어 세었는지를 증명합니다." },
    { send: ["server", "chain"], text: "recordTallyBatch(증명, 득표)", value: "공개 값 160개", note: "증명과 득표를 체인에 올립니다." },
    { at: "chain", text: "증명 입력 = 체인의 암호문·공개키?", value: "일치", ok: true, note: "다른 표를 넣고 증명하면 여기서 거절됩니다." },
    { at: "chain", text: "개표 증명 검증", value: "통과", ok: true, note: "표를 빼거나 득표를 바꾸면 통과하지 못합니다." },
    { at: "chain", text: "최종 득표 기록", value: "누구나 조회 가능", note: "결과가 체인에 남습니다." },
    { at: "server", text: "코디 개인키 폐기", value: "삭제", note: "개표가 끝나면 키를 지웁니다." },
  ],
};
