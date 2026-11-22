// 데모 체험 안내 (서버가 DEMO_MODE=1 일 때만 보인다)
// 화면 오른쪽 아래 버튼 → 단계 안내 + 데모 계정 + 체인 검증 보기
import { useEffect, useState } from "react";
import ChainVerifyPanel from "./ChainVerifyPanel";
import "../styles/DemoGuide.css";

const API = import.meta.env.VITE_API_BASE_URL;

const STEPS = [
  "학생 1 계정으로 로그인합니다 (인증 코드는 자동 입력).",
  "'2026 총학생회장 선거'에 들어가 투표 키를 만듭니다. 패스키가 안 되면 복구 코드 방식으로.",
  "후보를 골라 투표합니다. 투표 증명은 이 브라우저에서 몇 초간 만들어집니다.",
  "같은 계정으로 다시 투표해 보세요. 이중투표로 거절됩니다.",
  "다른 학생들로도 투표한 뒤, 관리자 계정으로 선거를 종료하고 개표합니다.",
  "'체인 검증 보기'에서 누가 누굴 뽑았는지는 안 보이지만, 표 수와 개표 증명은 체인에서 확인되는 것을 봅니다.",
];

const EXTRA = [
  "명단 밖 학생으로 투표 화면에 들어가면 자격 없음으로 막힙니다.",
  "'예정' 탭의 학과 대표 선거에서는 투표 키를 미리 등록하고, 키를 잃었다고 가정해 새 키로 다시 등록할 수 있습니다.",
];

function Account({ email, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="demo-account"
      onClick={() => {
        navigator.clipboard?.writeText(email);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title="눌러서 복사"
    >
      <span className="demo-account-label">{label}</span>
      <span className="demo-account-email">{copied ? "복사됨" : email}</span>
    </button>
  );
}

export default function DemoGuide() {
  const [info, setInfo] = useState(null);
  // 넓은 화면은 오른쪽에 붙여 두고 본문을 옆으로 민다 (버튼을 가리지 않게). 좁은 화면은 접은 채 시작
  const [open, setOpen] = useState(() => globalThis.innerWidth >= 1100);
  const [verifyOpen, setVerifyOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}/demo/info`)
      .then((r) => r.json())
      .then((d) => setInfo(d?.enabled ? d : null))
      .catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    const on = !!info && open;
    document.body.classList.toggle("demo-guide-open", on);
    return () => document.body.classList.remove("demo-guide-open");
  }, [info, open]);

  if (!info) return null;

  return (
    <>
      {verifyOpen && <ChainVerifyPanel onClose={() => setVerifyOpen(false)} />}
      {!open ? (
        <button className="demo-fab" onClick={() => setOpen(true)}>체험 안내</button>
      ) : (
        <aside className="demo-guide">
          <div className="demo-guide-head">
            <strong>체험 안내 (데모)</strong>
            <button className="demo-close" onClick={() => setOpen(false)} aria-label="접기">접기</button>
          </div>
          <ol className="demo-steps">
            {STEPS.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <div className="demo-section-title">계정 (눌러서 복사)</div>
          <div className="demo-accounts">
            <Account email={info.admin.email} label={info.admin.label} />
            {info.students.map((s) => <Account key={s.email} email={s.email} label={s.label} />)}
            {info.outsider && <Account email={info.outsider.email} label={info.outsider.label} />}
          </div>
          <div className="demo-section-title">더 해 볼 것</div>
          <ul className="demo-extra">
            {EXTRA.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          <button className="demo-verify-btn" onClick={() => setVerifyOpen(true)}>체인 검증 보기</button>
          <p className="demo-note">로컬 테스트 체인과 데모 데이터입니다. 실제 메일·재학증명 확인은 하지 않습니다.</p>
        </aside>
      )}
    </>
  );
}
