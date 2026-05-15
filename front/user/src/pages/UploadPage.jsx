import { useState, useRef } from "react";
import "../styles/UploadPage.css";

const LOGO = "/src/jejun.png";

function Header({ studentId, onLogout }) {
  return (
    <header className="header">
      <div className="header-left">
        <img src={LOGO} alt="제주대학교 로고" className="header-logo-img" />
        <div className="header-title-group">
          <span className="header-title">제주대학교 전자투표</span>
          <span className="header-subtitle">Jeju National University E-Voting</span>
        </div>
      </div>
      <div className="header-right">
        <div className="header-user">
          <span>👤</span><span>{studentId}</span>
        </div>
        <button className="logout-button" onClick={onLogout}>로그아웃</button>
      </div>
    </header>
  );
}

/* ── 학생증 업로드 화면 ── */
function UploadForm({ studentId, onLogout, onSubmit }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <>
      <Header studentId={studentId} onLogout={onLogout} />
      <div className="upload-wrapper">
        <div className="upload-card">
          <div className="upload-card-title">학생증 인증</div>
          <p className="upload-card-desc">
            투표 참여를 위해 학생증 사진을 업로드해주세요.<br />
            관리자 검토 후 투표 권한이 부여됩니다.
          </p>

          {/* 미리보기 or 드롭존 */}
          {preview ? (
            <div className="upload-preview">
              <img src={preview} alt="학생증 미리보기" />
            </div>
          ) : (
            <div
              className={`upload-dropzone ${file ? "has-file" : ""}`}
              onClick={() => inputRef.current.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <div className="upload-dropzone-icon">🪪</div>
              <p className="upload-dropzone-text">
                <strong>클릭</strong>하거나 파일을 여기에 드래그하세요<br />
                JPG, PNG, PDF 지원
              </p>
            </div>
          )}

          <input
            ref={inputRef} type="file" accept="image/*,application/pdf"
            style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])}
          />

          {/* 파일 선택 후 다시 선택 버튼 */}
          {preview && (
            <button
              className="upload-back-btn"
              style={{ marginBottom: 12 }}
              onClick={() => { setFile(null); setPreview(null); }}
            >
              다시 선택
            </button>
          )}

          <div className="upload-notice">
            ⚠️ 학생증의 이름과 학번이 명확히 보여야 합니다. 개인정보는 인증 목적으로만 사용됩니다.
          </div>

          <button
            className="upload-btn"
            disabled={!file}
            onClick={() => onSubmit()}
          >
            제출하기
          </button>
          <button className="upload-back-btn" onClick={onLogout}>로그아웃</button>
        </div>
      </div>
    </>
  );
}

/* ── 승인 대기 화면 ── */
function WaitingScreen({ studentId, onLogout, onRefresh }) {
  return (
    <>
      <Header studentId={studentId} onLogout={onLogout} />
      <div className="upload-wrapper">
        <div className="upload-card" style={{ textAlign: "center" }}>
          <div className="waiting-icon">🕐</div>
          <div className="waiting-title">검토 중입니다</div>
          <p className="waiting-desc">
            학생증 사진이 제출되었습니다.<br />
            관리자 검토 후 투표 권한이 부여됩니다.<br />
            승인까지 잠시 기다려주세요.
          </p>
          <button className="waiting-refresh-btn" onClick={onRefresh}>
            상태 확인하기
          </button>
          <button className="upload-back-btn" onClick={onLogout}>로그아웃</button>
        </div>
      </div>
    </>
  );
}

/* ── 메인 UploadPage ── */
export default function UploadPage({ studentId, onLogout, onSubmit, onRefresh, isPending }) {
  if (isPending) {
    return <WaitingScreen studentId={studentId} onLogout={onLogout} onRefresh={onRefresh} />;
  }
  return <UploadForm studentId={studentId} onLogout={onLogout} onSubmit={onSubmit} />;
}
