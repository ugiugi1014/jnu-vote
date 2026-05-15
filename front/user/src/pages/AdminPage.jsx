import { useState, useEffect } from "react";
import "../styles/AdminPage.css";

const LOGO = "/src/jejun.png";

/* ── 더미 데이터 ── */
const INIT_AGENDAS = [
  { id: 1, title: "2026년 1학기 총학생회 회장 선거", category: "학생회", status: "active", startDate: "2026-03-20", endDate: "2026-03-27",
    desc: "제주대학교 총학생회 회장 및 부회장 선출 투표입니다.",
    candidates: [
      { id: 1, name: "김제주", dept: "경영학과 3학년", slogan: "학생이 중심이 되는 대학" },
      { id: 2, name: "이한라", dept: "컴퓨터공학과 4학년", slogan: "소통하는 총학생회" },
      { id: 3, name: "박성산", dept: "행정학과 3학년", slogan: "변화와 혁신의 시작" },
    ]},
  { id: 2, title: "공과대학 학생회 임원 선출", category: "단과대", status: "active", startDate: "2026-03-18", endDate: "2026-03-25",
    desc: "공과대학 학생회 임원진을 선출합니다.",
    candidates: [
      { id: 1, name: "최성수", dept: "기계공학과 3학년", slogan: "소통하는 공대" },
      { id: 2, name: "박지원", dept: "전기공학과 2학년", slogan: "더 나은 공대를 위해" },
    ]},
  { id: 3, title: "2026년 2학기 장학금 배분 투표", category: "총학생회", status: "upcoming", startDate: "2026-08-01", endDate: "2026-08-07",
    desc: "2학기 자체 장학금 배분 방식을 결정합니다.",
    candidates: [
      { id: 1, name: "안건 A", dept: "성적 우수 중심", slogan: "성적 우수자 우선 배분" },
      { id: 2, name: "안건 B", dept: "형편 우선 중심", slogan: "경제적 어려움 우선 배분" },
    ]},
  { id: 4, title: "2025년 2학기 축제 기획안 투표", category: "축제", status: "ended", startDate: "2025-09-01", endDate: "2025-09-07",
    desc: "가을 축제 기획안 선정 투표입니다.",
    candidates: [
      { id: 1, name: "K-POP 페스티벌", dept: "공연기획팀", slogan: "신나는 K-POP 공연" },
      { id: 2, name: "전통 문화 축제", dept: "문화기획팀", slogan: "우리 문화의 멋" },
      { id: 3, name: "EDM 콘서트", dept: "음악기획팀", slogan: "밤을 달구는 EDM" },
    ]},
];

const PENDING_VOTERS = [
  { id: 1, name: "홍길동", studentId: "2021208001", requestDate: "2026-03-18" },
  { id: 2, name: "김제주", studentId: "2022103045", requestDate: "2026-03-19" },
  { id: 3, name: "이한라", studentId: "2023305021", requestDate: "2026-03-20" },
];

const APPROVED_VOTERS = [
  { id: 4, name: "박성산", studentId: "2020208010", approvedDate: "2026-03-15" },
  { id: 5, name: "최백록", studentId: "2021305033", approvedDate: "2026-03-15" },
];

const STATUS_LABEL = { active: "진행중", upcoming: "예정", ended: "종료" };
const STATUS_BADGE = { active: "badge-active", upcoming: "badge-upcoming", ended: "badge-ended" };

/* ── 아이콘 ── */
function AgendaIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="13" y2="15"/></svg>;
}
function VoterIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function LogoutIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
}
function BallotIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>;
}
function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function LockIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}

/* ════════════════════════════════════════
   안건 정보 모달
════════════════════════════════════════ */
function InfoModal({ agenda, onClose }) {
  if (!agenda) return null;

  // mock 득표수 데이터
  // TODO: 백엔드 연동 시 아래 useEffect로 교체
  // const [results, setResults] = useState({});
  // useEffect(() => {
  //   if (agenda.status !== "ended") return;
  //   fetch(`/api/elections/${agenda.id}/results`)
  //     .then(r => r.json())
  //     .then(data => setResults(data.votes)); // { candidateId: count }
  // }, [agenda.id]);
  const mockResults = { 1: 42, 2: 31, 3: 18 };
  const totalVotes = Object.values(mockResults).reduce((a, b) => a + b, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h3>안건 정보</h3>
        <div className="info-header">
          <div className="info-icon"><BallotIcon /></div>
          <div>
            <div className="info-modal-title">{agenda.title}</div>
            <div className="info-modal-meta">
              📅 {agenda.startDate} ~ {agenda.endDate}
              &nbsp;<span className={`badge ${STATUS_BADGE[agenda.status]}`}>{STATUS_LABEL[agenda.status]}</span>
            </div>
          </div>
        </div>

        <div className="info-section">안건 설명</div>
        <p className="info-desc-text">{agenda.desc}</p>

        <div className="info-section">후보자</div>
        {agenda.candidates.map(c => (
          <div className="cand-card" key={c.id}>
            <div className="cand-num">{c.id}</div>
            <div style={{ flex: 1 }}>
              <div className="cand-name">{c.name}</div>
              <div className="cand-dept">{c.dept}</div>
              <div className="cand-slogan">{c.slogan}</div>
              {agenda.status === "ended" && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 3 }}>
                    {mockResults[c.id] ?? 0}표 ({totalVotes > 0 ? Math.round((mockResults[c.id] ?? 0) / totalVotes * 100) : 0}%)
                  </div>
                  <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${totalVotes > 0 ? (mockResults[c.id] ?? 0) / totalVotes * 100 : 0}%`,
                      background: "#3B6D11",
                      borderRadius: 3,
                      transition: "width 0.4s"
                    }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   안건 수정 모달
════════════════════════════════════════ */
function EditModal({ agenda, onClose, onSave }) {
  const isLocked = agenda.status === "active" || agenda.status === "ended";
  const [form, setForm] = useState({
    title: agenda.title,
    desc: agenda.desc,
    category: agenda.category,
    status: agenda.status,
    startDate: agenda.startDate,
    endDate: agenda.endDate,
    candidates: agenda.candidates.map(c => ({ ...c })),
  });

  const updateField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addCandidate = () => setForm(f => ({
    ...f,
    candidates: [...f.candidates, { id: f.candidates.length + 1, name: "", dept: "", slogan: "" }]
  }));

  const removeCandidate = (idx) => {
    if (form.candidates.length <= 1) return;
    setForm(f => ({ ...f, candidates: f.candidates.filter((_, i) => i !== idx).map((c, i) => ({ ...c, id: i + 1 })) }));
  };

  const updateCandidate = (idx, key, val) => setForm(f => ({
    ...f,
    candidates: f.candidates.map((c, i) => i === idx ? { ...c, [key]: val } : c)
  }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>안건 수정</h3>

        {isLocked && (
          <div className="lock-notice">
            <LockIcon />
            {agenda.status === "active" ? "진행중" : "종료된"} 안건은 기간만 수정할 수 있습니다.
          </div>
        )}

        <div className="form-group">
          <label className="form-label">안건명</label>
          <input className="form-input" type="text" value={form.title}
            disabled={isLocked}
            onChange={e => updateField("title", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">설명</label>
          <textarea className="form-textarea" value={form.desc}
            disabled={isLocked}
            onChange={e => updateField("desc", e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">카테고리</label>
            <select className="form-select" value={form.category}
              disabled={isLocked}
              onChange={e => updateField("category", e.target.value)}>
              {["학생회","단과대","학과","총학생회","축제"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">상태</label>
            <select className="form-select" value={form.status}
              disabled={isLocked}
              onChange={e => updateField("status", e.target.value)}>
              <option value="upcoming">예정</option>
              <option value="active">진행중</option>
              <option value="ended">종료</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">시작일</label>
            <input className="form-input" type="date" value={form.startDate}
              onChange={e => updateField("startDate", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">종료일</label>
            <input className="form-input" type="date" value={form.endDate}
              onChange={e => updateField("endDate", e.target.value)} />
          </div>
        </div>

        {/* 후보자 수정 - 잠금 시 숨김 */}
        {!isLocked && (
          <>
            <div className="candidate-section-label">후보자 수정</div>
            <div className="candidate-list">
              {form.candidates.map((c, idx) => (
                <div className="candidate-item" key={idx}>
                  <div className="candidate-item-header">
                    <span>후보 {idx + 1}</span>
                    <button className="candidate-remove-btn" onClick={() => removeCandidate(idx)}>×</button>
                  </div>
                  <div className="form-row">
                    <input className="form-input" type="text" placeholder="이름" value={c.name}
                      onChange={e => updateCandidate(idx, "name", e.target.value)} />
                    <input className="form-input" type="text" placeholder="학과 및 학년" value={c.dept}
                      onChange={e => updateCandidate(idx, "dept", e.target.value)} />
                  </div>
                  <input className="form-input" type="text" placeholder="공약 한 줄" value={c.slogan}
                    onChange={e => updateCandidate(idx, "slogan", e.target.value)} />
                </div>
              ))}
            </div>
            <button className="add-candidate-btn" onClick={addCandidate}>+ 후보 추가</button>
          </>
        )}

        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>취소</button>
          <button className="modal-submit-btn" onClick={() => onSave(form)}>수정 완료</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   안건 추가 모달
════════════════════════════════════════ */
function CreateModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    title: "", desc: "", category: "학생회", status: "upcoming",
    startDate: "", endDate: "",
    candidates: [{ id: 1, name: "", dept: "", slogan: "" }],
  });

  const updateField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addCandidate = () => setForm(f => ({
    ...f,
    candidates: [...f.candidates, { id: f.candidates.length + 1, name: "", dept: "", slogan: "" }]
  }));

  const removeCandidate = (idx) => {
    if (form.candidates.length <= 1) return;
    setForm(f => ({ ...f, candidates: f.candidates.filter((_, i) => i !== idx).map((c, i) => ({ ...c, id: i + 1 })) }));
  };

  const updateCandidate = (idx, key, val) => setForm(f => ({
    ...f,
    candidates: f.candidates.map((c, i) => i === idx ? { ...c, [key]: val } : c)
  }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>안건 추가</h3>
        <div className="form-group">
          <label className="form-label">안건명</label>
          <input className="form-input" type="text" placeholder="예: 2026년 1학기 총학생회 회장 선거"
            value={form.title} onChange={e => updateField("title", e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">설명</label>
          <textarea className="form-textarea" placeholder="안건에 대한 설명을 입력하세요"
            value={form.desc} onChange={e => updateField("desc", e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">카테고리</label>
            <select className="form-select" value={form.category} onChange={e => updateField("category", e.target.value)}>
              {["학생회","단과대","학과","총학생회","축제"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">상태</label>
            <select className="form-select" value={form.status} onChange={e => updateField("status", e.target.value)}>
              <option value="upcoming">예정</option>
              <option value="active">진행중</option>
              <option value="ended">종료</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">시작일</label>
            <input className="form-input" type="date" value={form.startDate} onChange={e => updateField("startDate", e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">종료일</label>
            <input className="form-input" type="date" value={form.endDate} onChange={e => updateField("endDate", e.target.value)} />
          </div>
        </div>

        <div className="candidate-section-label">후보자</div>
        <div className="candidate-list">
          {form.candidates.map((c, idx) => (
            <div className="candidate-item" key={idx}>
              <div className="candidate-item-header">
                <span>후보 {idx + 1}</span>
                <button className="candidate-remove-btn" onClick={() => removeCandidate(idx)}>×</button>
              </div>
              <div className="form-row">
                <input className="form-input" type="text" placeholder="이름" value={c.name}
                  onChange={e => updateCandidate(idx, "name", e.target.value)} />
                <input className="form-input" type="text" placeholder="학과 및 학년" value={c.dept}
                  onChange={e => updateCandidate(idx, "dept", e.target.value)} />
              </div>
              <input className="form-input" type="text" placeholder="공약 한 줄" value={c.slogan}
                onChange={e => updateCandidate(idx, "slogan", e.target.value)} />
            </div>
          ))}
        </div>
        <button className="add-candidate-btn" onClick={addCandidate}>+ 후보 추가</button>

        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>취소</button>
          <button className="modal-submit-btn" onClick={() => onCreate(form)}>저장</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   학생증 사진 모달
════════════════════════════════════════ */
function PhotoModal({ voter, onClose, onApprove }) {
  if (!voter) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>학생증 사진 확인</h3>
        <div className="img-preview">🪪</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>{voter.name}</div>
          <div style={{ fontSize: 13, color: "#888" }}>학번: {voter.studentId}</div>
        </div>
        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>닫기</button>
          <button className="modal-submit-btn" onClick={() => onApprove(voter.id)}>승인</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   안건 관리 섹션
════════════════════════════════════════ */
function AgendaSection() {
  const [agendas, setAgendas] = useState(INIT_AGENDAS);
  const [infoTarget, setInfoTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = agendas.filter(a => a.title.includes(search) || a.category.includes(search));

  const handleSave = async (form) => {
    // TODO: 백엔드 연동 시 주석 해제
    // await fetch(`/api/elections/${editTarget.id}`, {
    //   method: 'PUT',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(form),
    // });
    setAgendas(prev => prev.map(a => a.id === editTarget.id ? { ...a, ...form } : a));
    setEditTarget(null);
  };

  const handleCreate = async (form) => {
    // TODO: 백엔드 연동 시 주석 해제
    // ElectionFactory 컨트랙트 호출로 교체 예정
    // const res = await fetch('/api/elections', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(form),
    // });
    // const { id } = await res.json();
    // setAgendas(prev => [...prev, { ...form, id }]);
    const newId = Math.max(...agendas.map(a => a.id)) + 1;
    setAgendas(prev => [...prev, { ...form, id: newId }]);
    setShowCreate(false);
  };

  return (
    <>
      <div className="admin-page-header">
        <h2>안건 관리</h2>
        <p>투표 안건을 생성하고 수정할 수 있습니다</p>
      </div>

      <div className="toolbar">
        <input className="search-input" type="text" placeholder="안건 검색..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <PlusIcon />안건 추가
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>안건명</th><th>카테고리</th><th>기간</th><th>상태</th><th>후보수</th><th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id}>
                <td><strong>{a.title}</strong></td>
                <td>{a.category}</td>
                <td>{a.startDate} ~ {a.endDate}</td>
                <td><span className={`badge ${STATUS_BADGE[a.status]}`}>{STATUS_LABEL[a.status]}</span></td>
                <td>{a.candidates.length}명</td>
                <td>
                  <button className="action-btn info" onClick={() => setInfoTarget(a)}>정보</button>
                  <button className="action-btn" onClick={() => setEditTarget(a)}>수정</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {infoTarget && <InfoModal agenda={infoTarget} onClose={() => setInfoTarget(null)} />}
      {editTarget && <EditModal agenda={editTarget} onClose={() => setEditTarget(null)} onSave={handleSave} />}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </>
  );
}

/* ════════════════════════════════════════
   유권자 관리 섹션
════════════════════════════════════════ */
function VoterSection() {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState(PENDING_VOTERS);
  const [approved, setApproved] = useState(APPROVED_VOTERS);
  const [photoTarget, setPhotoTarget] = useState(null);
  const [search, setSearch] = useState("");

  const handleApprove = async (id) => {
    const voter = pending.find(v => v.id === id);
    if (!voter) return;

    // TODO: 백엔드 연동 시 주석 해제
    // await fetch(`/api/voters/${id}/approve`, { method: 'POST' });
    // 승인 후 백엔드가 해당 지갑 주소에 토큰 발행
    // await fetch(`/api/voters/${id}/mint-token`, { method: 'POST' });

    setPending(prev => prev.filter(v => v.id !== id));
    setApproved(prev => [...prev, { ...voter, approvedDate: new Date().toISOString().slice(0, 10) }]);
    setPhotoTarget(null);
  };

  const handleRevoke = async (id) => {
    // TODO: 백엔드 연동 시 주석 해제
    // await fetch(`/api/voters/${id}/revoke`, { method: 'POST' });
    setApproved(prev => prev.filter(v => v.id !== id));
  };

  const filteredPending = pending.filter(v => v.name.includes(search) || v.studentId.includes(search));
  const filteredApproved = approved.filter(v => v.name.includes(search) || v.studentId.includes(search));

  return (
    <>
      <div className="admin-page-header">
        <h2>유권자 관리</h2>
        <p>학생증 사진을 검토하고 유권자를 승인하세요</p>
      </div>

      <div className="inner-tab-bar">
        <button className={`inner-tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
          승인 대기 ({pending.length})
        </button>
        <button className={`inner-tab ${tab === "approved" ? "active" : ""}`} onClick={() => setTab("approved")}>
          승인 완료 ({approved.length})
        </button>
      </div>

      <div className="toolbar">
        <input className="search-input" type="text" placeholder="학번 또는 이름 검색..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {tab === "pending" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>이름</th><th>학번</th><th>신청일</th><th>상태</th><th>관리</th></tr>
            </thead>
            <tbody>
              {filteredPending.map(v => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.studentId}</td>
                  <td>{v.requestDate}</td>
                  <td><span className="badge badge-pending">승인 대기</span></td>
                  <td>
                    <button className="action-btn info" onClick={() => setPhotoTarget(v)}>사진 확인 · 승인</button>
                    <button className="action-btn danger" onClick={() => setPending(prev => prev.filter(p => p.id !== v.id))}>거절</button>
                  </td>
                </tr>
              ))}
              {filteredPending.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: "center", color: "#bbb", padding: "32px 0" }}>승인 대기 중인 유권자가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "approved" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>이름</th><th>학번</th><th>승인일</th><th>상태</th><th>관리</th></tr>
            </thead>
            <tbody>
              {filteredApproved.map(v => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.studentId}</td>
                  <td>{v.approvedDate}</td>
                  <td><span className="badge badge-approved">승인 완료</span></td>
                  <td><button className="action-btn danger" onClick={() => handleRevoke(v.id)}>취소</button></td>
                </tr>
              ))}
              {filteredApproved.length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: "center", color: "#bbb" }}>승인된 유권자가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {photoTarget && (
        <PhotoModal voter={photoTarget} onClose={() => setPhotoTarget(null)} onApprove={handleApprove} />
      )}
    </>
  );
}

/* ════════════════════════════════════════
   메인 AdminPage
════════════════════════════════════════ */
export default function AdminPage({ studentId, onLogout }) {
  const [menu, setMenu] = useState("agenda");

  return (
    <>
      {/* 헤더 */}
      <header className="admin-header">
        <div className="admin-header-left">
          <img src={LOGO} alt="제주대학교 로고" className="admin-logo-img" />
          <div>
            <div className="admin-header-title">
              제주대학교 전자투표 <span className="admin-badge">관리자</span>
            </div>
            <div className="admin-header-subtitle">Jeju National University E-Voting</div>
          </div>
        </div>
        <div className="admin-header-right">
          <span>👤 {studentId}</span>
          <button className="admin-logout-btn" onClick={onLogout}>
            <LogoutIcon />로그아웃
          </button>
        </div>
      </header>

      <div className="admin-layout">
        {/* 사이드바 */}
        <aside className="sidebar">
          <div className="sidebar-label">관리 메뉴</div>
          <ul className="sidebar-menu">
            <li>
              <div className={`sidebar-item ${menu === "agenda" ? "active" : ""}`} onClick={() => setMenu("agenda")}>
                <AgendaIcon />안건 관리
              </div>
            </li>
            <li>
              <div className={`sidebar-item ${menu === "voter" ? "active" : ""}`} onClick={() => setMenu("voter")}>
                <VoterIcon />유권자 관리
              </div>
            </li>
          </ul>
        </aside>

        {/* 메인 */}
        <main className="admin-main">
          {menu === "agenda" && <AgendaSection />}
          {menu === "voter" && <VoterSection />}
        </main>
      </div>
    </>
  );
}
