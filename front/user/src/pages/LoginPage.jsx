import { useState } from "react";
import "../styles/LoginPage.css";
import { createWallet } from "../services/walletService.js";

const LOGO = "/src/jejun.png";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

async function readApiError(res, fallback) {
  try {
    const data = await res.json();
    return data.message || fallback;
  } catch {
    return fallback;
  }
}

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();
  const isEmailValid = normalizedEmail.length > 0;
  const isCodeValid = code.trim().length > 0;

  const handleSendCode = async () => {
    if (!isEmailValid || isLoading) return;

    if (import.meta.env.DEV) {
      if (normalizedEmail === "admin") {
        onLogin({ email: "admin", role: "admin", token: null, wallet: null, verification: { status: "approved" } });
        return;
      }
      if (["user", "user1"].includes(normalizedEmail)) {
        onLogin({ email: normalizedEmail, role: "user", token: null, wallet: null, verification: { status: "approved" } });
        return;
      }
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-code`, {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "인증 코드 발송에 실패했습니다."));
      }

      setStep(2);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!isCodeValid || isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-code`, {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, code: code.trim() }),
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        throw new Error(await readApiError(res, "인증 코드 확인에 실패했습니다."));
      }

      const data = await res.json();
      const wallet = data.serverSecret
        ? await createWallet(normalizedEmail, data.serverSecret)
        : null;

      if (data.token && wallet?.address) {
        const walletRes = await fetch(`${API_BASE_URL}/auth/wallet`, {
          method: "POST",
          body: JSON.stringify({ wallet_address: wallet.address }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.token}`,
          },
        });

        if (!walletRes.ok) {
          throw new Error(await readApiError(walletRes, "지갑 주소 등록에 실패했습니다."));
        }
      }

      onLogin({
        email: normalizedEmail,
        role: data.role || "user",
        token: data.token,
        wallet,
        verification: data.verification || { status: "none" },
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-logo">
          <img src={LOGO} alt="제주대학교 로고" className="login-logo-img" />
        </div>
        <h1 className="login-title">제주대학교 전자투표</h1>
        <p className="login-subtitle">학교 이메일로 인증 코드를 받아 로그인합니다.</p>

        <div className="form-group">
          <label className="form-label">이메일</label>
          <input
            type="email"
            className={`form-input ${email ? "has-value" : ""}`}
            placeholder="예: 20210001@stu.jejunu.ac.kr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={step === 2 || isLoading}
            autoComplete="email"
          />
        </div>

        {step === 2 && (
          <div className="form-group">
            <label className="form-label">인증 코드</label>
            <input
              type="text"
              className={`form-input ${code ? "has-value" : ""}`}
              placeholder="이메일로 받은 6자리 코드"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              disabled={isLoading}
              autoComplete="one-time-code"
            />
            <p className="form-hint" onClick={() => { setStep(1); setCode(""); }}>
              이메일을 잘못 입력했나요? <span className="form-hint-link">다시 입력</span>
            </p>
          </div>
        )}

        {step === 1 ? (
          <button
            className="login-button"
            onClick={handleSendCode}
            disabled={!isEmailValid || isLoading}
          >
            {isLoading ? "발송 중..." : "인증 코드 발송"}
          </button>
        ) : (
          <button
            className="login-button"
            onClick={handleConfirm}
            disabled={!isCodeValid || isLoading}
          >
            {isLoading ? "확인 중..." : "확인"}
          </button>
        )}

        <p className="login-footer">인증 후 인앱 지갑이 자동으로 재생성됩니다.</p>
      </div>
    </div>
  );
}
