import { useState } from "react";
import { Icon } from "../components/Icons";
import { TABS, VOTES } from "../data/mockData";
import "../styles/VoteListPage.css";

const LOGO = "/src/jejun.png";

/* 인증 상태 배지 */
function AuthStatus({ status, onGoUpload }) {
  if (status === "approved") {
    return <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>🟢 인증완료</span>;
  }
  if (status === "pending") {
    return <span style={{ fontSize: 13, color: "#a16207", fontWeight: 600 }}>🟡 검토중</span>;
  }
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>🔴 미인증</span>
      <button
        onClick={onGoUpload}
        style={{
          padding: "5px 12px", background: "#1a5fa8", color: "#fff",
          border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        인증하기
      </button>
    </span>
  );
}

export default function VoteListPage({ studentId, onLogout, onVote, onResult, userStatus, onGoUpload }) {
  const [activeTab, setActiveTab] = useState("active");
  const votes = VOTES[activeTab] || [];

  const isApproved = userStatus === "approved";

  const handleVoteClick = (vote) => {
    if (!isApproved) { onGoUpload(); return; }
    onVote(vote);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <img src={LOGO} alt="제주대학교 로고" className="header-logo-img" />
          <div className="header-title-group">
            <span className="header-title">제주대학교 전자투표</span>
            <span className="header-subtitle">Jeju National University E-Voting</span>
          </div>
        </div>
        <div className="header-right">
          <div className="header-user"><Icon.User /><span>{studentId}</span></div>
          <AuthStatus status={userStatus} onGoUpload={onGoUpload} />
          <button className="logout-button" onClick={onLogout}><Icon.Logout />로그아웃</button>
        </div>
      </header>

      <main className="main">
        <h1 className="page-title">투표 목록</h1>
        <p className="page-desc">진행중인 투표에 참여하거나 결과를 확인하세요</p>

        <div className="tab-bar">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {votes.length === 0
          ? <div className="empty-state">해당 투표가 없습니다.</div>
          : votes.map(vote => (
            <div className="vote-card" key={vote.id}>
              <div className="vote-card-top">
                <span className="badge badge-outline">{vote.category}</span>
                {vote.status === "active" && <span className="badge badge-active">진행중</span>}
                {vote.status === "ended"  && <span className="badge badge-ended">종료</span>}
                {vote.voted              && <span className="badge badge-voted">투표 완료</span>}
              </div>
              <div className="vote-card-title">{vote.title}</div>
              <div className="vote-card-desc">{vote.desc}</div>
              <div className="vote-card-bottom">
                <div className="vote-card-meta">
                  <span className="meta-item"><Icon.Calendar />{vote.period}</span>
                  {vote.voters && <span className="meta-item"><Icon.People color="#999" />투표자 {vote.voters}</span>}
                </div>
                {vote.status === "active" && !vote.voted && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <button
                      className={`vote-button ${isApproved ? "vote-button-primary" : "vote-button-outline"}`}
                      style={!isApproved ? { color: "#bbb", borderColor: "#e0e0e0", cursor: "not-allowed" } : {}}
                      onClick={() => handleVoteClick(vote)}
                    >
                      투표하기
                    </button>
                    {!isApproved && (
                      <span style={{ fontSize: 11, color: "#aaa" }}>
                        {userStatus === "pending" ? "학생증 검토 중입니다" : "학생증 인증이 필요합니다"}
                      </span>
                    )}
                  </div>
                )}
                {vote.status === "ended" &&
                  <button className="vote-button vote-button-outline" onClick={() => onResult(vote)}>결과 보기</button>}
              </div>
            </div>
          ))
        }
      </main>
    </>
  );
}

