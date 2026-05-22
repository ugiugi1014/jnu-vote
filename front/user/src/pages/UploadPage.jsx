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
  const [verificationStudentId, setVerificationStudentId] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();
  const [docNo1, setDocNo1] = useState("");
  const [docNo2, setDocNo2] = useState("");
  const [docNo3, setDocNo3] = useState("");
  const [docNo4, setDocNo4] = useState("");

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setError("");

    if (f.type === "application/pdf") {
      setPreview("pdf");
      return;
    }

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
          <div className="upload-card-title">재학증명서 인증</div>
          <p className="upload-card-desc">
            투표 참여를 위해 재학증명서 사진을 업로드해주세요.<br />.
          </p>

          <div className="upload-field">
            <label className="upload-label">학번</label>
            <input
              className="upload-input"
              value={verificationStudentId}
              placeholder="학생증에 표시된 학번"
              onChange={(e) => {
                setVerificationStudentId(e.target.value);
                setError("");
              }}
            />
          </div>

          <div className="upload-field">
            <label className="upload-label">재학증명서 문서번호</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {[
                [docNo1, setDocNo1],
                [docNo2, setDocNo2],
                [docNo3, setDocNo3],
                [docNo4, setDocNo4],
              ].map(([val, setter], i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    className="upload-input"
                    value={val}
                    maxLength={4}
                    placeholder="XXXX"
                    style={{ width: 72, textAlign: "center", letterSpacing: 2 }}
                    onChange={e => {
                      setter(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase());
                      setError("");
                    }}
                  />
                  {i < 3 && <span style={{ color: "#aaa" }}>-</span>}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
              증명서 좌측 상단의 진위확인 문서번호를 입력하세요
            </p>
          </div>
          {/* 미리보기 or 드롭존 */}
          {preview ? (
            <div className="upload-preview">
              {preview === "pdf" ? (
                <div className="upload-pdf-preview">PDF 파일 선택됨</div>
              ) : (
                <img src={preview} alt="학생증 미리보기" />
              )}
            </div>
          ) : (
            <div
              className={`upload-dropzone ${file ? "has-file" : ""}`}
              onClick={() => inputRef.current.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <div className="upload-dropzone-icon">📄</div>
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

          {error && <div className="upload-error">{error}</div>}

          <button
            className="upload-btn"
            disabled={
              !file ||
              !verificationStudentId.trim() ||
              [docNo1, docNo2, docNo3, docNo4].some(v => v.length !== 4) ||
              submitting
            }
            onClick={async () => {
              try {
                setSubmitting(true);
                setError("");
                //진위확인
                const docNo = docNo1 + docNo2 + docNo3 + docNo4;
                await onSubmit(file, verificationStudentId.trim(), docNo);
              } catch (err) {
                setError(err.message);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "확인 중..." : "제출하기"}
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
