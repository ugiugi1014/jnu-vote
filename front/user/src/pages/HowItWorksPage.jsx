// 작동 원리 보기: 플로우차트 + 단계 설명 + 자세히 보기 + 직접 해 보기 + 누가 무엇을 아는가 + 공격 시도
import { useEffect, useState } from "react";
import FlowDiagram from "../components/flow/FlowDiagram";
import TryIt from "../components/flow/TryIt";
import AttackPanel from "../components/flow/AttackPanel";
import { STEPS, ACTORS } from "../components/flow/steps";
import "../styles/HowItWorks.css";

function KnowsTable({ step }) {
  return (
    <div className="hiw-knows">
      <div className="hiw-section-title">누가 무엇을 아는가</div>
      <div className="hiw-knows-grid">
        {ACTORS.map((a) => (
          <div key={a.id} className={`hiw-knows-col ${step.nodes.includes(a.id) ? "active" : ""}`}>
            <div className="hiw-knows-head">{a.label}</div>
            {(step.knows[a.id] || []).map((t, i) => (
              <div key={i} className={`hiw-know ${t.startsWith("✓") ? "yes" : "no"}`}>{t}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Summary() {
  return (
    <div className="hiw-summary">
      <div className="hiw-sum-col ok">
        <strong>검증으로 보장 (믿을 필요 없음)</strong>
        <ul>
          <li>명단에 있는 사람만, 한 번씩만 투표</li>
          <li>체인의 모든 표가 빠짐없이 정확히 집계</li>
          <li>관리자가 표를 빼거나 바꾸면 개표 기록이 거절</li>
          <li>코디네이터 키는 체인에 고정 (몰래 바꿀 수 없음)</li>
        </ul>
      </div>
      <div className="hiw-sum-col trust">
        <strong>관리자(서버)를 신뢰</strong>
        <ul>
          <li>개별 표 내용: 코디네이터 개인키로 열 수 있음</li>
          <li>relay 요청의 IP·시간으로 투표자를 추측하지 않음</li>
          <li>향후 과제: 키를 여러 사람이 나눠 갖기</li>
        </ul>
      </div>
    </div>
  );
}

export default function HowItWorksPage({ onBack }) {
  const [index, setIndex] = useState(0);
  const [openFold, setOpenFold] = useState(""); // "단계번호:detail" 처럼 단계별로 따로 (넘기면 자동으로 닫힘)
  const [lab, setLab] = useState({}); // 직접 해 보기 결과를 단계 사이에 이어서 쓴다
  const step = STEPS[index];

  const showDetail = openFold === `${index}:detail`;
  const showTry = openFold === `${index}:try`;
  const toggle = (name) => setOpenFold((cur) => (cur === `${index}:${name}` ? "" : `${index}:${name}`));

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="hiw-page">
      <header className="hiw-top">
        {onBack && <button className="hiw-back" onClick={onBack}>← 돌아가기</button>}
        <h1>jnu-vote 작동 원리</h1>
        <span className="hiw-top-sub">화살표 키나 아래 버튼으로 넘겨 보세요</span>
      </header>

      <div className="hiw-main">
        <div className="hiw-left">
          <FlowDiagram step={step} />
          <KnowsTable step={step} />
        </div>

        <aside className="hiw-panel">
          <div className="hiw-step-no">{index + 1} / {STEPS.length}</div>
          <h2>{step.title}</h2>
          <p className="hiw-desc">{step.desc}</p>

          {step.summary && <Summary />}

          {step.detail && (
            <div className="hiw-fold">
              <button className="hiw-fold-btn" onClick={() => toggle("detail")}>
                {showDetail ? "▾" : "▸"} 자세히 보기
              </button>
              {showDetail && (
                <dl className="hiw-detail">
                  {step.detail.map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          )}

          {step.tryIt && (
            <div className="hiw-fold">
              <button className="hiw-fold-btn" onClick={() => toggle("try")}>
                {showTry ? "▾" : "▸"} 직접 해 보기
              </button>
              {showTry && <TryIt kind={step.tryIt} lab={lab} setLab={setLab} />}
            </div>
          )}

          {step.attacks && (
            <div className="hiw-fold">
              <div className="hiw-section-title">공격 시도</div>
              <AttackPanel kinds={step.attacks} />
            </div>
          )}
        </aside>
      </div>

      <nav className="hiw-nav">
        <button className="hiw-btn ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>◀ 이전</button>
        <div className="hiw-dots">
          {STEPS.map((s, i) => (
            <button key={s.id} className={`hiw-dot ${i === index ? "on" : ""} ${i < index ? "done" : ""}`} onClick={() => setIndex(i)} title={s.title} />
          ))}
        </div>
        <button className="hiw-btn" disabled={index === STEPS.length - 1} onClick={() => setIndex(index + 1)}>다음 ▶</button>
      </nav>
    </div>
  );
}
