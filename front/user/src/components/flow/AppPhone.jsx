// 학생 휴대폰 화면: 흐름도와 같은 순간에 실제 앱에서 학생이 보는 화면 (실제 앱 화면을 작게 옮긴 것)
const ELECTION = "2026 총학생회장 선거";
const CANDS = [
  { no: 0, name: "김한라", dept: "컴퓨터공학과" },
  { no: 1, name: "이백록", dept: "경영학과" },
  { no: 2, name: "박돌담", dept: "해양생명과학과" },
];
const VOTING_STAGES = ["후보를 암호화하는 중", "투표 증명 만드는 중", "체인에 제출하는 중"];
const RESULT = [3, 3, 2];

const Tap = ({ on }) => (on ? <span className="ap-tap" /> : null);

function Header({ back, unverified }) {
  return back ? (
    <div className="ap-head small"><span className="ap-back">← 목록으로</span><img src="/jejun.png" alt="" className="ap-logo-s" /></div>
  ) : (
    <div className="ap-head">
      <img src="/jejun.png" alt="" className="ap-logo" />
      <div><div className="ap-brand">제주대학교 전자투표</div><div className="ap-brand-sub">Jeju National University E-Voting</div></div>
      <span className={`ap-verified ${unverified ? "no" : ""}`}>{unverified ? "인증 필요" : "● 인증완료"}</span>
    </div>
  );
}

function ElectionCard() {
  return (
    <div className="ap-card ap-el">
      <div className="ap-el-icon">✓</div>
      <div><div className="ap-el-title">{ELECTION}</div><div className="ap-muted">투표 마감: 2026. 12. 2.</div></div>
    </div>
  );
}

function Candidates({ sel, tap }) {
  return (
    <>
      <div className="ap-sec">후보자 선택</div>
      {CANDS.map((c) => (
        <div key={c.no} className={`ap-card ap-cand ${sel === c.no ? "on" : ""}`}>
          <span className="ap-cand-no">{c.no}</span>
          <div><div className="ap-cand-name">기호 {c.no} {c.name}</div><div className="ap-muted">{c.dept}</div></div>
          {sel === c.no && <span className="ap-check">✓</span>}
          <Tap on={tap === "cand" && sel === c.no} />
        </div>
      ))}
    </>
  );
}

function Screen({ a }) {
  switch (a.s) {
    case "login":
    case "code":
      return (
        <div className="ap-login">
          <img src="/jejun.png" alt="" className="ap-login-logo" />
          <div className="ap-login-title">제주대학교 전자투표</div>
          <div className="ap-muted center">학교 웹메일로 로그인하세요</div>
          <div className="ap-input filled">20260001@stu.jejunu.ac.kr</div>
          {a.s === "login" ? (
            <div className="ap-btn">인증 코드 받기<Tap on={a.tap === "send"} /></div>
          ) : (
            <>
              <div className="ap-input filled code">4 8 2 1 7 3</div>
              <div className="ap-btn">로그인<Tap on={a.tap === "login"} /></div>
            </>
          )}
          {a.busy && <div className="ap-busy"><span className="ap-spin" />{a.busy}</div>}
        </div>
      );
    case "upload":
      return (
        <>
          <Header unverified />
          <div className="ap-body">
            <div className="ap-h1">재학 인증</div>
            <div className="ap-muted">처음 한 번만 하면 됩니다.</div>
            <div className="ap-card ap-drop">
              <div className="ap-file">재학증명서.jpg</div>
              <div className="ap-btn ghost">사진 올리기<Tap on={a.tap === "upload"} /></div>
            </div>
            <div className="ap-field">학번</div>
            <div className={`ap-input ${a.filled ? "filled" : ""}`}>{a.filled ? "20260001" : "자동으로 채워집니다"}</div>
            <div className="ap-field">재학증명서 문서번호</div>
            <div className={`ap-input ${a.filled ? "filled" : ""}`}>{a.filled ? "1234-5678-9012-3456" : "자동으로 채워집니다"}</div>
            <div className="ap-btn">인증 신청<Tap on={a.tap === "request"} /></div>
            {a.busy && <div className="ap-busy"><span className="ap-spin" />{a.busy}</div>}
          </div>
        </>
      );
    case "list":
      return (
        <>
          <Header unverified={a.unverified} />
          <div className="ap-body">
            <div className="ap-h1">투표 목록</div>
            <div className="ap-tabs"><span className="on">진행중</span><span>예정</span><span>종료</span></div>
            <div className="ap-card">
              <span className="ap-badge">진행중</span>
              <div className="ap-el-title">{ELECTION}</div>
              <div className="ap-muted">투표자 3</div>
              <div className={`ap-btn sm right ${a.unverified ? "disabled" : ""}`}>투표하기<Tap on={a.tap === "vote"} /></div>
            </div>
          </div>
        </>
      );
    case "key":
      return (
        <>
          <Header back />
          <div className="ap-body">
            <ElectionCard />
            <div className="ap-card">
              <div className="ap-sec2">투표권 만들기</div>
              <div className="ap-muted">나만 아는 투표권을 만듭니다. 서버는 이 투표권을 모릅니다.</div>
              <div className="ap-btn">패스키로 만들기<Tap on={a.tap === "passkey"} /></div>
              <div className="ap-btn ghost">복구 코드로 만들기</div>
            </div>
            {a.busy && <div className="ap-busy"><span className="ap-spin" />{a.busy}</div>}
          </div>
        </>
      );
    case "ready":
      return (
        <>
          <Header back />
          <div className="ap-body">
            <div className="ap-ok">✓ 투표권 준비됨 · 명단 등록 완료</div>
            <Candidates sel={a.sel} tap={a.tap} />
          </div>
          <div className="ap-bottom"><div className="ap-btn ghost">취소</div><div className={`ap-btn ${a.sel === undefined ? "disabled" : ""}`}>투표하기</div></div>
        </>
      );
    case "voting":
      return (
        <>
          <Header back />
          <div className="ap-body">
            <Candidates sel={1} />
          </div>
          <div className="ap-bottom"><div className="ap-btn ghost">취소</div><div className="ap-btn">투표하기<Tap on={a.tapVote} /></div></div>
          <div className="ap-modal">
            <div className="ap-modal-box">
              <div className="ap-sec2">투표 제출 중</div>
              {VOTING_STAGES.map((t, i) => (
                <div key={t} className={`ap-stage ${i < a.stage ? "done" : i === a.stage ? "now" : ""}`}>
                  <span className="ap-stage-dot">{i < a.stage ? "✓" : i === a.stage ? <span className="ap-spin" /> : ""}</span>{t}
                </div>
              ))}
              {a.stage === 1 && <div className="ap-bar"><span className={a.progress ? "run" : ""} /></div>}
              <div className="ap-muted">이 화면을 닫지 마세요</div>
            </div>
          </div>
        </>
      );
    case "voted":
      return (
        <>
          <Header back />
          <div className="ap-body">
            <div className="ap-done">
              <div className="ap-done-icon">✓</div>
              <div className="ap-sec2">투표가 완료되었습니다</div>
              <div className="ap-muted center">누구를 뽑았는지는 기록되지 않습니다.</div>
              <div className="ap-receipt"><div className="ap-muted">내 표 확인 번호 (nullifier)</div><div className="ap-mono">0x2c3d…9a41</div></div>
            </div>
          </div>
        </>
      );
    case "closed":
      return (
        <>
          <Header />
          <div className="ap-body">
            <div className="ap-h1">투표 목록</div>
            <div className="ap-tabs"><span>진행중</span><span>예정</span><span className="on">종료</span></div>
            <div className="ap-card">
              <span className="ap-badge gray">종료 · 개표 중</span>
              <div className="ap-el-title">{ELECTION}</div>
              <div className="ap-busy inline"><span className="ap-spin" />개표 증명을 체인에 기록하는 중</div>
            </div>
          </div>
        </>
      );
    case "result":
    default:
      return (
        <>
          <Header back />
          <div className="ap-body">
            <div className="ap-sec">{ELECTION} 결과</div>
            {CANDS.map((c, i) => (
              <div key={c.no} className="ap-card ap-res">
                <div className="ap-res-top"><span>기호 {c.no} {c.name}</span><strong>{RESULT[i]}표</strong></div>
                <div className="ap-res-bar"><span style={{ width: `${(RESULT[i] / 8) * 100}%` }} /></div>
              </div>
            ))}
            <div className="ap-ok">✓ 개표 증명이 체인에서 검증됨</div>
          </div>
        </>
      );
  }
}

export default function AppPhone({ app }) {
  return (
    <div className="ap-wrap">
      <div className="ap-label">학생이 보는 앱 화면</div>
      <div className="ap-phone">
        <div className="ap-notch" />
        <div className="ap-screen" key={app ? JSON.stringify(app) : "result"}>
          <Screen a={app || { s: "result" }} />
        </div>
      </div>
    </div>
  );
}
