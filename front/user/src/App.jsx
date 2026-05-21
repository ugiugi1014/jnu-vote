import { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import VoteListPage from "./pages/VoteListPage";
import VoteDetailPage from "./pages/VoteDetailPage";
import VoteResultPage from "./pages/VoteResultPage";
import AdminPage from "./pages/AdminPage";
import UploadPage from "./pages/UploadPage";
import { restoreWallet } from "./services/walletService";
import "./styles/global.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
const AUTH_STORAGE_KEY = "jnuVote.auth";
const WALLET_STORAGE_KEY = "jnuVote.walletPrivateKey";

function normalizeVerificationStatus(verification) {
  return verification?.status || "none";
}

export default function App() {
  const [page, setPage] = useState("upload");
  const [studentId, setStudentId] = useState("");
  const [role, setRole] = useState("user");
  const [token, setToken] = useState(null);
  const [currentVote, setCurrentVote] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [userStatus, setUserStatus] = useState("none");

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const clearSession = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(WALLET_STORAGE_KEY);
  };

  const applySession = ({ email, role: nextRole, token: nextToken, wallet: nextWallet, verification }) => {
    const nextStatus = normalizeVerificationStatus(verification);

    setStudentId(email || "");
    setRole(nextRole || "user");
    setToken(nextToken || null);
    setWallet(nextWallet || null);
    setUserStatus(nextStatus);

    if (nextToken) {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          email,
          role: nextRole || "user",
          token: nextToken,
          verificationStatus: nextStatus,
        })
      );
    }

    if (nextWallet?.privateKey) {
      sessionStorage.setItem(WALLET_STORAGE_KEY, nextWallet.privateKey);
    }

    setPage(nextRole === "admin" ? "admin" : "list");
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

    localStorage.setItem(
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

  useEffect(() => {
    const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!storedAuth) return;

    try {
      const parsed = JSON.parse(storedAuth);
      const restoredWallet = restoreWallet(sessionStorage.getItem(WALLET_STORAGE_KEY));

      setStudentId(parsed.email || "");
      setRole(parsed.role || "user");
      setToken(parsed.token || null);
      setWallet(restoredWallet);
      setUserStatus(parsed.verificationStatus || "none");
      setPage(parsed.role === "admin" ? "admin" : "list");

      if (parsed.token) {
        refreshProfile(parsed.token);
      }
    } catch {
      clearSession();
    }
  }, []);

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

  const handleUploadSubmit = async (file, verificationStudentId) => {
    if (!file || !token) return;

    const formData = new FormData();
    formData.append("student_id", verificationStudentId);
    formData.append("file", file);

    const res = await fetch(`${API_BASE_URL}/verification/request`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "학생증 인증 요청에 실패했습니다.");
    }

    setUserStatus("pending");
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
          token={token}
          authHeaders={authHeaders}
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
