// 체인 검증 보기: 서버를 거치지 않고 체인(VotingSystem)에서 직접 읽어 보여준다.
//  - 등록된 투표권 수, 들어온 표(암호문), 사용된 nullifier
//  - 개표 배치 기록과 최종 득표 (개표 증명이 컨트랙트에서 검증돼야 기록된다)
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import VotingSystemABI from "../abi/VotingSystem.json";

const API = import.meta.env.VITE_API_BASE_URL;
const STATUS = { pending: "시작 전", active: "투표 중", closed: "투표 종료 (개표 전)", tallied: "개표 완료" };
const short = (v, n = 10) => {
  const s = typeof v === "string" ? v : ethers.toBeHex(v);
  return s.length > n * 2 ? `${s.slice(0, n + 2)}…${s.slice(-6)}` : s;
};

// 득표는 컨트랙트에 후보 DB id(recordTallyBatch 의 candidateIds)로 저장된다 → 후보 목록의 id 로 읽는다
async function readElection(address, candidates) {
  const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
  const vs = new ethers.Contract(address, VotingSystemABI, provider);
  const [commitments, votes, numCandidates, open, tallied, processed, castEvents, batchEvents] = await Promise.all([
    vs.getCommitments(),
    vs.getAllVotes(),
    vs.numCandidates(),
    vs.electionOpen(),
    vs.tallied(),
    vs.batchesProcessed(),
    vs.queryFilter(vs.filters.VoteCast(), 0),
    vs.queryFilter(vs.filters.TallyBatchRecorded(), 0),
  ]);
  let totalBatches = null;
  try { totalBatches = Number(await vs.totalBatches()); } catch { /* 투표 중에는 없음 */ }
  const counts = [];
  if (tallied) {
    for (const c of candidates) counts.push({ name: c.name, count: Number(await vs.getVoteCount(c.id)) });
  }
  return {
    commitments: commitments.length,
    votes: votes.map((v) => ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], v.encryptedData ?? v[0])[0]),
    nullifiers: castEvents.map((e) => e.args.nullifier),
    batches: batchEvents.map((e) => ({ index: Number(e.args.batchIndex), tx: e.transactionHash })),
    numCandidates: Number(numCandidates), open, tallied, processed: Number(processed), totalBatches, counts,
  };
}

export default function ChainVerifyPanel({ onClose }) {
  const [elections, setElections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/elections`)
      .then((r) => r.json())
      .then((rows) => {
        const list = (rows || []).filter((e) => e.contract_address);
        setElections(list);
        if (list.length) setSelected(list.find((e) => e.status === "active") || list[0]);
      })
      .catch(() => setError("선거 목록을 불러오지 못했습니다."));
  }, []);

  const refresh = async (e = selected) => {
    if (!e) return;
    setLoading(true);
    setError("");
    try {
      const cands = await fetch(`${API}/elections/${e.id}/candidates`).then((r) => r.json()).catch(() => []);
      const sorted = [...(cands || [])].sort((a, b) => Number(a.candidate_index) - Number(b.candidate_index));
      setData(await readElection(e.contract_address, sorted));
    } catch (err) {
      setError("체인에서 읽지 못했습니다: " + (err.shortMessage || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selected) refresh(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <div className="demo-modal-overlay" onClick={onClose}>
      <div className="demo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="demo-guide-head">
          <strong>체인 검증 보기</strong>
          <button className="demo-close" onClick={onClose}>닫기</button>
        </div>
        <p className="demo-note">아래 값은 서버가 아니라 블록체인 컨트랙트에서 직접 읽은 것입니다.</p>
        <div className="demo-row">
          <select
            className="demo-select"
            value={selected?.id || ""}
            onChange={(ev) => setSelected(elections.find((e) => String(e.id) === ev.target.value))}
          >
            {elections.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button className="demo-verify-btn small" onClick={() => refresh()} disabled={loading}>
            {loading ? "읽는 중..." : "새로고침"}
          </button>
        </div>
        {selected && <div className="demo-mono">컨트랙트 {selected.contract_address}</div>}
        {error && <div className="demo-error">{error}</div>}
        {data && (
          <div className="demo-verify-grid">
            <section>
              <h4>1. 유권자 명단 (투표권)</h4>
              <p>등록된 투표권 <b>{data.commitments}</b>개. 투표권에는 학번이 들어 있지 않아, 체인만 봐서는 누구 것인지 알 수 없습니다.</p>
            </section>
            <section>
              <h4>2. 들어온 표</h4>
              <p>표 <b>{data.votes.length}</b>개 · 상태 {data.tallied ? "개표 완료" : data.open ? "투표 중" : STATUS[selected?.status] || "투표 종료"}. 표는 암호문으로만 저장됩니다.</p>
              <ul className="demo-mono-list">
                {data.votes.slice(0, 8).map((c, i) => <li key={i}>표 {i + 1}: {short(c)}</li>)}
                {data.votes.length > 8 && <li>… 외 {data.votes.length - 8}개</li>}
              </ul>
            </section>
            <section>
              <h4>3. 사용된 nullifier (이중투표 방지)</h4>
              <p>같은 학생이 다시 투표하면 같은 nullifier 가 나와 컨트랙트가 거절합니다. 이 값으로 학생을 알아낼 수는 없습니다.</p>
              <ul className="demo-mono-list">
                {data.nullifiers.slice(0, 8).map((n, i) => <li key={i}>{short(n)}</li>)}
              </ul>
            </section>
            <section>
              <h4>4. 개표 증명</h4>
              {data.batches.length === 0 ? (
                <p>아직 개표 기록이 없습니다. 관리자가 종료 후 개표하면 배치마다 증명이 컨트랙트에서 검증되고 기록됩니다.</p>
              ) : (
                <>
                  <p>
                    개표 배치 {data.processed}{data.totalBatches != null ? `/${data.totalBatches}` : ""}개가 증명 검증을 통과해 기록됐습니다.
                    관리자가 표를 빼거나 바꾸면 이 기록 자체가 거절됩니다.
                  </p>
                  <ul className="demo-mono-list">
                    {data.batches.map((b) => <li key={b.index}>배치 {b.index}: tx {short(b.tx)}</li>)}
                  </ul>
                </>
              )}
              {data.tallied && (
                <table className="demo-table">
                  <tbody>
                    {data.counts.map((c, i) => <tr key={i}><td>{c.name}</td><td><b>{c.count}</b>표</td></tr>)}
                    <tr><td>합계</td><td>{data.counts.reduce((a, b) => a + b.count, 0)}표 (체인의 표 {data.votes.length}개와 같아야 함)</td></tr>
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
