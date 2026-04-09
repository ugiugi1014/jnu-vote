import { useState } from "react";
import "../styles/LoginPage.css";

const LOGO = "/src/jejun.png";

export default function LoginPage({ onLogin }) {
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const isValid = studentId.length > 0 && password.length > 0;

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-logo">
          <img src={LOGO} alt="제주대학교 로고" className="login-logo-img" />
        </div>
        <h1 className="login-title">제주대학교 전자투표</h1>
        <p className="login-subtitle">학생 포털 계정으로 로그인하세요</p>

        <div className="form-group">
          <label className="form-label">학번</label>
          <input
            type="text"
            className={`form-input ${studentId ? "has-value" : ""}`}
            placeholder="예: 20210001"
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            maxLength={10}
            autoComplete="off"
          />
        </div>
        <div className="form-group">
          <label className="form-label">비밀번호</label>
          <input
            type="password"
            className={`form-input ${password ? "has-value" : ""}`}
            placeholder="비밀번호를 입력하세요"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>

        <button
          className="login-button"
          onClick={() => isValid && onLogin(studentId)}
          disabled={!isValid}
        >
          로그인
        </button>
        <p className="login-footer">포털 계정 비밀번호를 사용합니다</p>
      </div>
    </div>
  );
}
