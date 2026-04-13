import { useState } from "react";
import { Icon } from "../components/Icons";
import { TABS, VOTES } from "../data/mockData";
import "../styles/VoteListPage.css";

const LOGO = "/src/jejun.png";

function AuthStatus({ status, onGoUpload }) {
  if (status === "approved") {
    return <span className="auth-approved">🟢 인증완료</span>;
  }
  if (status === "pending") {
    return <span className="auth-pending">🟡 검토중</span>;
  }
  return (
    <span className="auth-none-wrap">
      <span className="auth-none">🔴 미인증</span>
      <button className="auth-btn" onClick={onGoUpload}>인증하기</button>
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
        <div className="header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
          <img src={LOGO} alt="제주대학교 로고" className="header-logo-img" />
            <div className="header-title-group">
              <span className="header-title">제주대학교 전자투표</span>
              <span className="header-subtitle">Jeju National University E-Voting</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="header-user"><Icon.User /><span>{studentId}</span></div>
              <button className="logout-button" onClick={onLogout}><Icon.Logout />로그아웃</button>
            </div>
            <AuthStatus status={userStatus} onGoUpload={onGoUpload} />
          </div>
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
