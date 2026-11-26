import { useEffect, useRef, useState } from "react";
import LoginPage from "./pages/LoginPage";
import VoteListPage from "./pages/VoteListPage";
import VoteDetailPage from "./pages/VoteDetailPage";
import VoteResultPage from "./pages/VoteResultPage";
import AdminPage from "./pages/AdminPage";
import UploadPage from "./pages/UploadPage";
import DemoGuide from "./components/DemoGuide";
import HowItWorksPage from "./pages/HowItWorksPage";
import { clearVoterKeys } from "./services/voterIdService";
import { getDemoInfo } from "./services/demoInfo";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (session) => {
    applySession(session);
  };

  const handleLogout = () => {
    clearSession();
    // 공용 기기에서 다음 사람이 앞사람의 투표권을 이어받지 않게, 이 브라우저에 남긴 투표권 바탕값을 지운다
    // (본인은 다음 로그인 때 패스키나 복구 코드로 되찾는다)
    clearVoterKeys();
    setStudentId("");
    setRole("user");
    setToken(null);
    setWallet(null);
    setUserStatus("none");
    setPage("login");
  };

  const handleVote = (vote) => {
    if (!wallet) { handleLogout(); return; }
    if (userStatus !== "approved") { alert("재학증명서 인증이 필요합니다."); return; }
    setCurrentVote(vote);
    setPage("detail");
  };
  
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

  // 재학증명서 OCR (서버가 OCR 키를 갖고 처리)
  const handleOcr = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/verification/ocr`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
    if (!res.ok) return null;
    return res.json();
  };

  const handleRefresh = async () => {
    const profile = await refreshProfile();
    if (profile) {
      setPage("list");
    }
  };

  const handleGoUpload = () => setPage("upload");
  // 작동 원리 화면: 어디서 열었든 돌아갈 곳을 기억해 둔다
  const [returnPage, setReturnPage] = useState("login");
  const openHowItWorks = () => { setReturnPage(page === "howitworks" ? returnPage : page); setPage("howitworks"); };

  // 전시 모드 (공용 기기 한 대)
  //  - 로그인한 관람객이 1분 동안 아무것도 안 하면 로그아웃 (다음 사람이 앞사람 계정을 이어 쓰지 않게)
  //  - 로그인 화면에 2분 동안 아무도 없으면 작동 원리를 스스로 재생 (누르면 로그인 화면으로)
  const [exhibition, setExhibition] = useState(false);
  const [attract, setAttract] = useState(false);
  useEffect(() => {
    getDemoInfo().then((d) => setExhibition(!!d?.exhibition));
  }, []);
  const live = useRef({});
  live.current = { page, token, role, logout: handleLogout };
  useEffect(() => {
    if (!exhibition) return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(() => {
      const { page: pg, token: tk, role: rl, logout } = live.current;
      const idle = Date.now() - last;
      if (tk && rl !== "admin" && idle > 60_000) {
        logout();
        last = Date.now();
      } else if (!tk && pg === "login" && idle > 120_000) {
        setAttract(true);
        setReturnPage("login");
        setPage("howitworks");
      }
    }, 1000);
    return () => {
      clearInterval(iv);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [exhibition]);

  return (
    <>
      {page === "login" && <LoginPage onLogin={handleLogin} onHowItWorks={openHowItWorks} />}
      {page === "howitworks" && (
        <HowItWorksPage
          autoplay={attract}
          onBack={() => { setAttract(false); setPage(returnPage); }}
        />
      )}
      {page === "admin" && <AdminPage studentId={studentId} onLogout={handleLogout} token={token} />}
      {page === "upload" && (
        <UploadPage
          studentId={studentId}
          onLogout={handleLogout}
          onSubmit={handleUploadSubmit}
          onOcr={handleOcr}
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
      {page !== "howitworks" && <DemoGuide onHowItWorks={openHowItWorks} />}
    </>
  );
}
