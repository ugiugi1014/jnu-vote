// 흐름 무대: 세 주체(학생 브라우저·서버·블록체인)의 상자 안에 이번 단계에서 하는 계산이 차례로 켜지고,
// 주체 사이에 오가는 데이터는 실제 값이 적힌 카드로 아래 통로를 따라 움직인다.
import { useEffect, useState } from "react";

const ACTORS = [
  { id: "student", title: "학생 브라우저", role: "투표하는 사람의 기기", x: 16.5 },
  { id: "server", title: "서버", role: "재학 확인 · 대신 제출 · 개표", x: 50 },
  { id: "chain", title: "블록체인", role: "명단 · 표 저장 · 증명 검증", x: 83.5 },
];
const X = Object.fromEntries(ACTORS.map((a) => [a.id, a.x]));

const short = (v) => {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return s.length > 22 ? `${s.slice(0, 9)}…${s.slice(-7)}` : s;
};
const valueOf = (beat, sample) => {
  if (beat.value) return beat.value;
  if (!beat.val) return "";
  if (!sample) return "계산 중…";
  return beat.val.map((k) => short(sample[k])).join(", ");
};

const OP_MS = 1700;
const SEND_MS = 2600;

export default function FlowStage({ step, sample }) {
  const beats = step.beats;
  const [cur, setCur] = useState(-1); // 지금 재생 중인 칸
  const [moved, setMoved] = useState(false); // 데이터 카드가 도착 쪽으로 출발했는지
  const [run, setRun] = useState(0);

  useEffect(() => {
    const timers = [];
    let t = 400;
    timers.push(setTimeout(() => { setCur(-1); setMoved(false); }, 0));
    beats.forEach((b, i) => {
      timers.push(setTimeout(() => { setCur(i); setMoved(false); }, t));
      if (b.send) timers.push(setTimeout(() => setMoved(true), t + 120));
      t += b.send ? SEND_MS : OP_MS;
    });
    timers.push(setTimeout(() => setCur(beats.length), t));
    return () => timers.forEach(clearTimeout);
  }, [beats, run]);

  const beat = beats[cur];
  const sendBeat = beat?.send ? beat : null;
  const busy = new Set();
  if (beat?.at) busy.add(beat.at);
  if (sendBeat) { busy.add(sendBeat.send[0]); busy.add(sendBeat.send[1]); }
  const finished = cur >= beats.length;

  return (
    <div className="hiw-stage">
      <div className="hiw-stage-row">
        {ACTORS.map((a) => {
          const ops = beats.map((b, i) => ({ b, i })).filter(({ b }) => b.at === a.id);
          const involved = beats.some((b) => b.at === a.id || b.send?.includes(a.id));
          return (
            <div key={a.id} className={`hiw-actor ${busy.has(a.id) ? "busy" : ""} ${involved ? "" : "idle"}`}>
              <div className="hiw-actor-head">
                <div className="hiw-actor-title">{a.title}</div>
                <div className="hiw-actor-role">{a.role}</div>
              </div>
              <div className="hiw-ops">
                {ops.length === 0 && <div className="hiw-op-empty">{involved ? "받기 · 보내기만" : "이번 단계에서는 하는 일 없음"}</div>}
                {ops.map(({ b, i }) => {
                  const state = i < cur || finished ? "done" : i === cur ? "now" : "todo";
                  const v = valueOf(b, sample);
                  return (
                    <div key={i} className={`hiw-op ${state}`}>
                      <div className="hiw-op-text">{b.text}</div>
                      {v && state !== "todo" && <div className={`hiw-op-val ${b.val ? "mono" : ""} ${b.ok === false ? "bad" : b.ok ? "good" : ""}`}>{v}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hiw-lane">
        <div className="hiw-lane-line" />
        <div className="hiw-lane-name">네트워크</div>
        {ACTORS.map((a) => <div key={a.id} className={`hiw-stub ${busy.has(a.id) && sendBeat ? "on" : ""}`} style={{ left: `${a.x}%` }} />)}
        {beats.map((b, i) => b.send && i <= cur && (
          <div
            key={`${run}-${i}`}
            className={`hiw-packet-card ${i === cur ? "moving" : "arrived"}`}
            style={{ left: `${i === cur && !moved ? X[b.send[0]] : X[b.send[1]]}%` }}
          >
            <div className="hiw-packet-dir">{i === cur ? (X[b.send[1]] > X[b.send[0]] ? "보내는 중 →" : "← 보내는 중") : "도착"}</div>
            <div className="hiw-packet-title">{b.text}</div>
            {valueOf(b, sample) && <div className={`hiw-packet-val ${b.val ? "mono" : ""}`}>{valueOf(b, sample)}</div>}
          </div>
        )).filter(Boolean).slice(-1)}
      </div>

      <div className="hiw-caption">
        <div className="hiw-caption-text">
          {beat ? (
            <>
              <span className="hiw-caption-who">{beat.send ? `${ACTORS.find((a) => a.id === beat.send[0]).title} → ${ACTORS.find((a) => a.id === beat.send[1]).title}` : ACTORS.find((a) => a.id === beat.at)?.title}</span>
              {beat.note || beat.text}
            </>
          ) : finished ? (
            beats.length ? "이번 단계 끝. 아래 버튼으로 다시 보거나 다음 단계로 넘어가세요." : step.stageNote || ""
          ) : "시작합니다…"}
        </div>
        <div className="hiw-caption-ctrl">
          <span className="hiw-beat-no">{beats.length ? `${Math.min(cur + 1, beats.length)} / ${beats.length}` : ""}</span>
          {beats.length > 0 && <button className="hiw-btn ghost small" onClick={() => setRun((r) => r + 1)}>다시 재생</button>}
        </div>
      </div>
    </div>
  );
}
