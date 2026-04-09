import { useState, useEffect } from "react";
import { Icon } from "../components/Icons";
import { RESULTS } from "../data/mockData";
import "../styles/VoteResultPage.css";

export default function VoteResultPage({ vote, onBack }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <nav className="nav-bar">
        <button className="nav-back" onClick={onBack}><Icon.ArrowLeft />목록으로</button>
      </nav>

      <main className="main">
        <div className="info-card-simple">
          <span className="info-badge">종료</span>
          <div className="info-title">{vote.title}</div>
          <div className="info-desc" style={{ fontSize: 14, color: "#888", marginTop: 4 }}>{vote.desc}</div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon stat-icon-blue"><Icon.People color="#1a5fa8" /></div>
            <div><div className="stat-value">2,150</div><div className="stat-label">총 투표수</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-green"><Icon.CheckCircle color="#16a34a" /></div>
            <div><div className="stat-value">61.4%</div><div className="stat-label">투표율</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-purple"><Icon.People color="#7c3aed" /></div>
            <div><div className="stat-value">3,500</div><div className="stat-label">전체 유권자</div></div>
          </div>
        </div>

        <div className="section-title">개표 결과</div>
        {RESULTS.map(r => (
          <div key={r.rank} className={`result-card ${r.elected ? "winner" : ""}`}>
            <div className="rank-circle">
              {r.elected && <div className="trophy-icon"><Icon.Trophy /></div>}
              {r.rank}
            </div>
            <div className="result-body">
              <div className="result-name-row">
                <span className="result-name">{r.name}</span>
                {r.elected && <span className="elected-badge">당선</span>}
              </div>
              <div className="result-votes">{r.votes.toLocaleString()}표</div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: animated ? `${r.pct}%` : "0%" }} />
              </div>
            </div>
            <div className="result-pct">{r.pct}%</div>
          </div>
        ))}

        <div className="footer-note">* 본 결과는 최종 집계된 결과입니다</div>
      </main>
    </>
  );
}
