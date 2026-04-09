import { useState } from "react";
import LoginPage from "./pages/LoginPage";
import VoteListPage from "./pages/VoteListPage";
import VoteDetailPage from "./pages/VoteDetailPage";
import VoteResultPage from "./pages/VoteResultPage";
import AdminPage from "./pages/AdminPage";
import UploadPage from "./pages/UploadPage";
import "./styles/global.css";

export default function App() {
  const [page, setPage] = useState("login");
  const [studentId, setStudentId] = useState("");
  const [currentVote, setCurrentVote] = useState(null);

  // none: 미신청 | pending: 검토중 | approved: 승인완료
  const [userStatus, setUserStatus] = useState("none");

  const handleLogin = (id) => {
    setStudentId(id);
    if (id === "admin") { setPage("admin"); return; }
    if (id === "2026") {setUserStatus("approved"); return; }
    setPage("list");
  };

  const handleLogout = () => {
    setStudentId("");
    setUserStatus("none");
    setPage("login");
  };

  const handleVote = (vote) => { setCurrentVote(vote); setPage("detail"); };
  const handleResult = (vote) => { setCurrentVote(vote); setPage("result"); };
  const handleBack = () => setPage("list");

  // 학생증 제출 → 대기 상태로
  const handleUploadSubmit = () => {
    setUserStatus("pending");
    setPage("list");
  };

  // 상태 확인 (백엔드 연동 시 API 호출로 교체)
  // 데모용: 버튼 클릭 시 approved로 변경
  const handleRefresh = () => {
    setUserStatus("approved");
    setPage("list");
  };

  const handleGoUpload = () => setPage("upload");

  return (
    <>
      {page === "login"  && <LoginPage onLogin={handleLogin} />}
      {page === "admin"  && <AdminPage studentId={studentId} onLogout={handleLogout} />}
      {page === "upload" && (
        <UploadPage
          studentId={studentId}
          onLogout={handleLogout}
          onSubmit={handleUploadSubmit}
          onRefresh={handleRefresh}
          isPending={userStatus === "pending"}
        />
      )}
      {page === "list" && (
        <VoteListPage
          studentId={studentId}
          onLogout={handleLogout}
          onVote={handleVote}
          onResult={handleResult}
          userStatus={userStatus}
          onGoUpload={handleGoUpload}
        />
      )}
      {page === "detail" && <VoteDetailPage vote={currentVote} onBack={handleBack} />}
      {page === "result" && <VoteResultPage vote={currentVote} onBack={handleBack} />}
    </>
  );
}
