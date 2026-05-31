import { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import VoteListPage from "./pages/VoteListPage";
import VoteDetailPage from "./pages/VoteDetailPage";
import VoteResultPage from "./pages/VoteResultPage";
import AdminPage from "./pages/AdminPage";
import UploadPage from "./pages/UploadPage";
import "./styles/global.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const AUTH_STORAGE_KEY = "jnuVote.auth";

function normalizeVerificationStatus(verification) {
  return verification?.status || "none";
}

export default function App() {
  const [page, setPage] = useState("login");
  const [studentId, setStudentId] = useState("");
  const [role, setRole] = useState("user");
  const [token, setToken] = useState(null);
  const [currentVote, setCurrentVote] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [userStatus, setUserStatus] = useState("none");

  // 앱 첫 로드 시 (새로고침 복원)
  useEffect(() => {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) { setPage("login"); return; }

    const parsed = JSON.parse(stored);
    setToken(parsed.token);
    setStudentId(parsed.email);
    setRole(parsed.role);
    setUserStatus(parsed.verificationStatus);
    // wallet은 복원 안 함 → 재로그인 유도
    setWallet(null);

    // 토큰 유효성 서버 확인
    refreshProfile(parsed.token);
  }, []);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const clearSession = () => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  };

  // 로그인 성공 시
  const applySession = ({ email, role, token, wallet, verification }) => {
    // 메모리에
    setToken(token);
    setWallet(wallet);           // privateKey는 메모리에만
    setStudentId(email);
    setRole(role);
    setPage(role === "admin" ? "admin" : "list");
    setUserStatus(normalizeVerificationStatus(verification));

    // sessionStorage에 (새로고침 대비, privateKey 제외)
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      email, role, token,
      verificationStatus: normalizeVerificationStatus(verification),
    }));
    // wallet.privateKey는 저장 안 함
  };

  const refreshProfile = async (activeToken = token) => {
    if (!activeToken) return null;

    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${activeToken}` },
    });

    if (!res.ok) {
      clearSession();
      setToken(null);
      setWallet(null);
      setStudentId("");
      setUserStatus("none");
      setPage("login");
      return null;
    }

    const profile = await res.json();
    setStudentId(profile.email);
    setRole(profile.role || "user");
    setUserStatus(normalizeVerificationStatus(profile.verification));
    setPage(profile.role === "admin" ? "admin" : "list");

    sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        email: profile.email,
        role: profile.role || "user",
        token: activeToken,
        verificationStatus: normalizeVerificationStatus(profile.verification),
      })
    );

    return profile;
  };

  const handleLogin = (session) => {
    applySession(session);
  };

  const handleLogout = () => {
    clearSession();
    setStudentId("");
    setRole("user");
    setToken(null);
    setWallet(null);
    setUserStatus("none");
    setPage("login");
  };

  const handleVote = (vote) => { setCurrentVote(vote); setPage("detail"); };
  const handleResult = (vote) => { setCurrentVote(vote); setPage("result"); };
  const handleBack = () => setPage("list");

  const handleUploadSubmit = async (file, studentId, docNo) => {
    //if (!file || !token) return;

    const formData = new FormData();
    formData.append("student_id", studentId);
    formData.append("doc_no", docNo);
    formData.append("file", file);

    const res = await fetch(`${API_BASE_URL}/verification/request`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "인증 요청에 실패했습니다.");
    }

    const { status } = await res.json();
    setUserStatus(status);
    setPage("list");
  };

  const handleRefresh = async () => {
    const profile = await refreshProfile();
    if (profile) {
      setPage("list");
    }
  };

  const handleGoUpload = () => setPage("upload");

  return (
    <>
      {page === "login" && <LoginPage onLogin={handleLogin} />}
      {page === "admin" && <AdminPage studentId={studentId} onLogout={handleLogout} token={token} />}
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
          role={role}
        />
      )}
      {page === "detail" && (
        <VoteDetailPage
          vote={currentVote}
          wallet={wallet}
          token={token}
          authHeaders={authHeaders}
          onBack={handleBack}
        />
      )}
      {page === "result" && <VoteResultPage vote={currentVote} onBack={handleBack} />}
    </>
  );
}
