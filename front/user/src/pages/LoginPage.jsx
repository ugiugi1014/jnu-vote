import { useState } from "react";
import "../styles/LoginPage.css";
import { createWallet } from "../services/walletService.js";

const LOGO = "/src/jejun.png";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1); // 1: 이메일 입력, 2: 인증코드 입력

  const isEmailValid = email.length > 0;
  const isCodeValid = code.length > 0;

  const handleSendCode = async () => {
    if (!isEmailValid) return;
    if (email === "admin") { onLogin("admin", null); return; } // admin mock
    if (email === "user") { onLogin("user", null); return; }
    if (email === "user1") { onLogin("user1", null); return; }
    // TODO: 백엔드 API 엔드포인트 확인 후 변경
    await fetch('/api/auth/send-code', {
     method: 'POST',
     body: JSON.stringify({ email }),
     headers: { 'Content-Type': 'application/json' }
    });
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!isCodeValid) return;
  
    // TODO: 백엔드 응답 키 이름 확인 후 변경 (serverSecret 부분)
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
      headers: { 'Content-Type': 'application/json' }
    });
    const { serverSecret } = await res.json();
  
    const { wallet } = await createWallet(email, serverSecret);
    onLogin(email, wallet);
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-logo">
          <img src={LOGO} alt="제주대학교 로고" className="login-logo-img" />
        </div>
        <h1 className="login-title">제주대학교 전자투표</h1>
        <p className="login-subtitle">학교 웹메일로 인증코드를 발송합니다</p>

        <div className="form-group">
          <label className="form-label">웹메일</label>
          <input
            type="email"
            className={`form-input ${email ? "has-value" : ""}`}
            placeholder="예: 20210001@jejunu.ac.kr"
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={step === 2}
            autoComplete="off"
          />
        </div>

        {step === 2 && (
          <div className="form-group">
            <label className="form-label">인증코드</label>
            <input
              type="text"
              className={`form-input ${code ? "has-value" : ""}`}
              placeholder="이메일로 받은 인증코드를 입력하세요"
              value={code}
              onChange={e => setCode(e.target.value)}
              maxLength={6}
              autoComplete="off"
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
            disabled={!isEmailValid}
          >
            인증코드 발송
          </button>
        ) : (
          <button
            className="login-button"
            onClick={handleConfirm}
            disabled={!isCodeValid}
          >
            확인
          </button>
        )}

        <p className="login-footer">학교 웹메일로 인증코드를 발송합니다</p>
      </div>
    </div>
  );
}

