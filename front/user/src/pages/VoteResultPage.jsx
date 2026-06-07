import { useState, useEffect } from "react";
import { Icon } from "../components/Icons";
import "../styles/VoteResultPage.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export default function VoteResultPage({ vote, onBack }) {
  const [animated, setAnimated] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadResult() {
      if (!vote?.id) {
        setMessage("선거 정보를 찾을 수 없습니다.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/elections/${vote.id}/result`);
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.message || "개표 결과를 불러오지 못했습니다.");
        }

        if (!ignore) {
          setResult(data);
          setMessage("");
        }
      } catch (err) {
        if (!ignore) setMessage(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadResult();
    return () => {
      ignore = true;
    };
  }, [vote?.id]);

  const rows = result?.results || [];
  const totalVoters = vote?.total_voters || vote?.totalVoters || vote?.voters || "-";
  const turnout =
    result && typeof totalVoters === "number" && totalVoters > 0
      ? `${((result.totalVotes / totalVoters) * 100).toFixed(1)}%`
      : "-";

  return (
    <>
      <nav className="nav-bar">
        <button className="nav-back" onClick={onBack}><Icon.ArrowLeft />목록으로</button>
      </nav>

      <main className="main">
        <div className="info-card-simple">
          <span className="info-badge">개표완료</span>
          <div className="info-title">{result?.title || vote?.title}</div>
          <div className="info-desc" style={{ fontSize: 14, color: "#888", marginTop: 4 }}>{vote?.desc || "최종 개표 결과입니다."}</div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon stat-icon-blue"><Icon.People color="#1a5fa8" /></div>
            <div><div className="stat-value">{result ? result.totalVotes.toLocaleString() : "-"}</div><div className="stat-label">총 투표수</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-green"><Icon.CheckCircle color="#16a34a" /></div>
            <div><div className="stat-value">{turnout}</div><div className="stat-label">투표율</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-purple"><Icon.People color="#7c3aed" /></div>
            <div><div className="stat-value">{totalVoters}</div><div className="stat-label">전체 유권자</div></div>
          </div>
        </div>

        <div className="section-title">개표 결과</div>
        {loading && <div className="result-empty">개표 결과를 불러오는 중입니다.</div>}
        {!loading && message && <div className="result-empty">{message}</div>}
        {!loading && !message && rows.map((r, index) => {
          const elected = result?.winner?.candidate_id === r.candidate_id;
          const pct = Number(r.percentage || 0);

          return (
          <div key={r.candidate_id} className={`result-card ${elected ? "winner" : ""}`}>
            <div className="rank-circle">
              {elected && <div className="trophy-icon"><Icon.Trophy /></div>}
              {index + 1}
            </div>
            <div className="result-body">
              <div className="result-name-row">
                <span className="result-name">{r.name}</span>
                {elected && <span className="elected-badge">당선</span>}
              </div>
              <div className="result-votes">{Number(r.vote_count || 0).toLocaleString()}표</div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: animated ? `${pct}%` : "0%" }} />
              </div>
            </div>
            <div className="result-pct">{pct}%</div>
          </div>
        );
        })}

        <div className="footer-note">* 본 결과는 최종 집계된 결과입니다</div>
      </main>
    </>
  );
}
