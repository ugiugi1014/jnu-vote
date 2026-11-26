// 작동 원리 보기: 플로우차트 + 단계 설명 + 자세히 보기 + 직접 해 보기 + 누가 무엇을 아는가 + 공격 시도
import { useEffect, useState } from "react";
import FlowStage from "../components/flow/FlowStage";
import { makeSample } from "../components/flow/sample";
import TryIt from "../components/flow/TryIt";
import AttackPanel from "../components/flow/AttackPanel";
import { ATTACKS, runAttack } from "../components/flow/attacks";
import { durationOf } from "../components/flow/timing";

const AUTOPLAY_PAUSE_MS = 4000; // 자동 재생: 한 단계 장면이 끝난 뒤 다음 단계로 넘어가기 전 쉬는 시간
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
        <strong>누구나 확인할 수 있는 것</strong>
        <ul>
          <li>명단에 있는 사람만, 한 번씩만 투표</li>
          <li>블록체인의 모든 표가 빠짐없이 정확히 개표</li>
          <li>관리자가 표를 빼거나 바꾸면 개표 기록이 거절</li>
          <li>관리자 공개키는 블록체인에 고정 (몰래 바꿀 수 없음)</li>
          <li>누가 누구를 뽑았는지는 서버·블록체인 어디에도 남지 않음</li>
        </ul>
      </div>
    </div>
  );
}

// autoplay: 전시 대기 화면용. 단계를 스스로 넘기고, 화면을 누르면 onBack
export default function HowItWorksPage({ onBack, autoplay = false }) {
  const [index, setIndex] = useState(0);
  const [openFold, setOpenFold] = useState({}); // { "단계번호:detail": true } — 자세히 보기·직접 해 보기를 따로 펼침 (단계를 넘기면 닫힌 상태)
  const [lab, setLab] = useState({}); // 직접 해 보기 결과를 단계 사이에 이어서 쓴다
  const [sample, setSample] = useState(null); // 흐름도에 보여 줄 실제 계산 값
  const [showFormula, setShowFormula] = useState(false); // 공식·함수 이름 보기 (전시 기본값: 끔)

  useEffect(() => {
    let alive = true;
    makeSample().then((s) => alive && setSample(s)).catch(() => {});
    return () => { alive = false; };
  }, []);
  const step = STEPS[index];

  // 공격 장면: 누르면 흐름도가 공격 장면으로 바뀌고, 동시에 데모 체인에 실제로 시도한다
  const [attack, setAttack] = useState(null);
  const startAttack = (kind) => {
    const run = Date.now();
    setAttack({ kind, run, step: index, script: ATTACKS[kind], result: null, revealed: false });
    // 왼쪽 결과는 흐름도 장면이 끝난 뒤에 보여 준다 (결말을 먼저 보여 주지 않게)
    setTimeout(() => setAttack((cur) => (cur && cur.run === run ? { ...cur, revealed: true } : cur)), durationOf(ATTACKS[kind].beats));
    runAttack(kind)
      .catch((err) => ({ live: true, blocked: false, raw: err.message, reason: `오류: ${err.message}`, lines: [] }))
      .then((result) => setAttack((cur) => (cur && cur.run === run ? { ...cur, result } : cur)));
  };
  const activeAttack = attack && attack.step === index ? attack : null; // 단계를 넘기면 원래 흐름

  const showDetail = !!openFold[`${index}:detail`];
  const showTry = !!openFold[`${index}:try`];
  const toggle = (name) => setOpenFold((cur) => ({ ...cur, [`${index}:${name}`]: !cur[`${index}:${name}`] }));

  useEffect(() => {
    if (!autoplay) return;
    const beats = STEPS[index].beats;
    const wait = beats.length ? durationOf(beats) + AUTOPLAY_PAUSE_MS : 12_000;
    const t = setTimeout(() => setIndex((i) => (i + 1) % STEPS.length), wait);
    return () => clearTimeout(t);
  }, [autoplay, index]);

  useEffect(() => {
    if (!autoplay) return;
    const exit = () => onBack?.();
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [autoplay, onBack]);

  useEffect(() => {
    if (autoplay) return;
    const onKey = (e) => {
      if (e.target?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoplay]);

  return (
    <div className="hiw-page">
      {autoplay && (
        <button className="hiw-attract" onClick={onBack} aria-label="투표 체험 시작">
          <span className="hiw-attract-msg">화면을 누르면 투표 체험을 시작합니다</span>
        </button>
      )}
      <header className="hiw-top">
        {onBack && <button className="hiw-back" onClick={onBack}>← 돌아가기</button>}
        <h1>jnu-vote 작동 원리</h1>
        <span className="hiw-top-sub">화살표 키나 아래 버튼으로 넘겨 보세요</span>
        <label className="hiw-formula-toggle">
          <input type="checkbox" checked={showFormula} onChange={(e) => setShowFormula(e.target.checked)} />
          공식 보기
        </label>
      </header>

      <div className="hiw-main">
        <aside className="hiw-panel">
          <div className="hiw-step-no">{index + 1} / {STEPS.length}</div>
          <h2>{step.title}</h2>
          <p className="hiw-desc">{step.desc}</p>

          {step.why.length > 0 && (
            <div className="hiw-why">
              {step.why.map(([q, a]) => (
                <div key={q} className="hiw-why-item">
                  <div className="hiw-why-q">{q}</div>
                  <div className="hiw-why-a">{a}</div>
                </div>
              ))}
            </div>
          )}

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
              <AttackPanel kinds={step.attacks} attack={activeAttack} onAttack={startAttack} />
            </div>
          )}
        </aside>

        <div className="hiw-left">
          <FlowStage step={step} sample={sample} showFormula={showFormula} attack={activeAttack} onExitAttack={() => setAttack(null)} />
          <KnowsTable step={step} />
        </div>

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
