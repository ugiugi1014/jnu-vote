// 공격 시도 목록: 누르면 흐름도 무대에서 공격 장면이 재생되고, 데모 체인에 실제로 시도한다
import { ATTACKS } from "./attacks";

export default function AttackPanel({ kinds, attack, onAttack }) {
  return (
    <div className="hiw-attacks">
      {kinds.map((k) => {
        const a = ATTACKS[k];
        const mine = attack?.kind === k;
        const r = mine && attack.revealed ? attack.result : null;
        return (
          <div key={k} className={`hiw-attack ${mine ? "on" : ""}`}>
            <div className="hiw-attack-head">
              <strong>{a.title}</strong>
              <button className="hiw-btn danger" onClick={() => onAttack(k)}>{mine ? "다시 공격" : "공격해 보기"}</button>
            </div>
            <p className="hiw-hint">{a.story}</p>
            {mine && !r && <div className="hiw-verdict info">공격 중… 오른쪽 흐름도를 보세요.</div>}
            {r?.info && <div className="hiw-verdict info">{r.info}</div>}
            {r && !r.info && (
              <div className={`hiw-verdict ${r.blocked ? "ok" : "bad"}`}>
                <div className="hiw-live">{r.live ? "실제 블록체인 응답" : "데모가 꺼져 있어 설명으로 보여 줍니다"}</div>
                <div><strong>{r.blocked ? "차단됨" : "통과됨"}</strong> — {r.reason}{r.live && r.raw !== r.reason ? ` ("${r.raw}")` : ""}</div>
                {r.lines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
