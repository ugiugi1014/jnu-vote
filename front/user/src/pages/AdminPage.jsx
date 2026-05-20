import { useCallback, useEffect, useMemo, useState } from "react";
import "../styles/AdminPage.css";

const LOGO = "/src/jejun.png";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const STATUS_LABEL = {
  pending: "대기",
  active: "진행중",
  closed: "종료",
  tallied: "개표완료",
};

const STATUS_BADGE = {
  pending: "badge-upcoming",
  active: "badge-active",
  closed: "badge-ended",
  tallied: "badge-approved",
};

const VERIFICATION_LABEL = {
  pending: "승인 대기",
  approved: "승인 완료",
  rejected: "거절",
  none: "미신청",
};

function AgendaIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="15" x2="13" y2="15" /></svg>;
}

function VoterIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}

function LogoutIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace(" ", "T").slice(0, 16);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toApiDateTime(value) {
  if (!value) return "";
  return value.replace("T", " ") + (value.length === 16 ? ":00" : "");
}

function formatDateTime(value) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function parseCandidateDescription(description = "") {
  const [dept = "", slogan = ""] = String(description || "").split("\n");
  return { dept, slogan };
}

function buildCandidateDescription(candidate) {
  return [candidate.dept, candidate.slogan].filter(Boolean).join("\n");
}

async function readApiError(res, fallback) {
  try {
    const data = await res.json();
    return data.message || data.error || fallback;
  } catch {
    return fallback;
  }
}

function createApi(token) {
  return async function api(path, options = {}) {
    const headers = {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      throw new Error(await readApiError(res, "요청 처리에 실패했습니다."));
    }

    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ textAlign: "center", color: "#aaa", padding: "32px 0" }}>
        {children}
      </td>
    </tr>
  );
}

function ElectionFormModal({ mode, election, onClose, onSubmit }) {
  const isEdit = mode === "edit";
  const canEditCandidates = !isEdit || election?.status === "pending";
  const [form, setForm] = useState(() => ({
    title: election?.title || "",
    description: election?.description || "",
    start_time: toDateTimeInput(election?.start_time),
    end_time: toDateTimeInput(election?.end_time),
    contract_address: election?.contract_address || "",
    token_contract_address: election?.token_contract_address || "",
    candidates: (election?.candidates || [{ name: "", dept: "", slogan: "" }]).map((candidate, index) => {
      const parsed = parseCandidateDescription(candidate.description);
      return {
        id: candidate.id,
        candidate_index: candidate.candidate_index ?? index,
        name: candidate.name || "",
        dept: candidate.dept || parsed.dept || "",
        slogan: candidate.slogan || parsed.slogan || "",
      };
    }),
  }));

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateCandidate = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      candidates: prev.candidates.map((candidate, i) =>
        i === index ? { ...candidate, [key]: value } : candidate
      ),
    }));
  };

  const addCandidate = () => {
    setForm((prev) => {
      if (prev.candidates.length >= 3) return prev;
      return {
        ...prev,
        candidates: [
          ...prev.candidates,
          { candidate_index: prev.candidates.length, name: "", dept: "", slogan: "" },
        ],
      };
    });
  };

  const removeCandidate = (index) => {
    setForm((prev) => ({
      ...prev,
      candidates: prev.candidates
        .filter((_, i) => i !== index)
        .map((candidate, i) => ({ ...candidate, candidate_index: i })),
    }));
  };

  const handleSubmit = () => {
    onSubmit({
      ...form,
      start_time: toApiDateTime(form.start_time),
      end_time: toApiDateTime(form.end_time),
      candidates: form.candidates.map((candidate, index) => ({
        ...candidate,
        candidate_index: index,
        description: buildCandidateDescription(candidate),
      })),
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <h3>{isEdit ? "선거 수정" : "선거 생성"}</h3>

        <div className="form-group">
          <label className="form-label">선거명</label>
          <input className="form-input" value={form.title} onChange={(event) => updateField("title", event.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">설명</label>
          <textarea className="form-textarea" value={form.description} onChange={(event) => updateField("description", event.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">시작 시간</label>
            <input className="form-input" type="datetime-local" value={form.start_time} onChange={(event) => updateField("start_time", event.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">종료 시간</label>
            <input className="form-input" type="datetime-local" value={form.end_time} onChange={(event) => updateField("end_time", event.target.value)} />
          </div>
        </div>

        {isEdit && (
          <>
            <div className="candidate-section-label">컨트랙트 주소</div>
            <div className="form-group">
              <label className="form-label">VotingSystem 주소</label>
              <input className="form-input" value={form.contract_address} placeholder="0x..." onChange={(event) => updateField("contract_address", event.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">VotingToken 주소</label>
              <input className="form-input" value={form.token_contract_address} placeholder="0x..." onChange={(event) => updateField("token_contract_address", event.target.value)} />
            </div>
          </>
        )}

        <div className="candidate-section-label">후보</div>
        {!canEditCandidates && (
          <div className="lock-notice">진행/종료된 선거는 후보를 수정하지 않고 기본 정보와 기간만 수정합니다.</div>
        )}
        <div className="candidate-list">
          {form.candidates.map((candidate, index) => (
            <div className="candidate-item" key={`${candidate.id || "new"}-${index}`}>
              <div className="candidate-item-header">
                <span>후보 {index + 1}</span>
                {canEditCandidates && form.candidates.length > 1 && (
                  <button className="candidate-remove-btn" type="button" onClick={() => removeCandidate(index)}>×</button>
                )}
              </div>
              <div className="form-row">
                <input className="form-input" disabled={!canEditCandidates} placeholder="이름" value={candidate.name} onChange={(event) => updateCandidate(index, "name", event.target.value)} />
                <input className="form-input" disabled={!canEditCandidates} placeholder="소속" value={candidate.dept} onChange={(event) => updateCandidate(index, "dept", event.target.value)} />
              </div>
              <input className="form-input" disabled={!canEditCandidates} placeholder="공약/설명" value={candidate.slogan} onChange={(event) => updateCandidate(index, "slogan", event.target.value)} />
            </div>
          ))}
        </div>
        {canEditCandidates && form.candidates.length < 3 && (
          <button className="add-candidate-btn" type="button" onClick={addCandidate}>+ 후보 추가</button>
        )}

        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>취소</button>
          <button className="modal-submit-btn" onClick={handleSubmit}>{isEdit ? "수정 완료" : "생성"}</button>
        </div>
      </div>
    </div>
  );
}

function ElectionInfoModal({ election, onClose }) {
  if (!election) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <h3>선거 상세</h3>
        <div className="info-header">
          <div className="info-icon"><AgendaIcon /></div>
          <div>
            <div className="info-modal-title">{election.title}</div>
            <div className="info-modal-meta">
              {formatDateTime(election.start_time)} ~ {formatDateTime(election.end_time)}
              <span className={`badge ${STATUS_BADGE[election.status]}`}>{STATUS_LABEL[election.status]}</span>
            </div>
          </div>
        </div>

        <div className="info-section">설명</div>
        <p className="info-desc-text">{election.description || "설명이 없습니다."}</p>

        <div className="info-section">컨트랙트</div>
        <p className="info-desc-text">VotingSystem: {election.contract_address || "미등록"}</p>
        <p className="info-desc-text">VotingToken: {election.token_contract_address || "미등록"}</p>

        <div className="info-section">후보</div>
        {(election.candidates || []).map((candidate) => {
          const parsed = parseCandidateDescription(candidate.description);
          return (
            <div className="cand-card" key={candidate.id}>
              <div className="cand-num">{candidate.candidate_index + 1}</div>
              <div>
                <div className="cand-name">{candidate.name}</div>
                <div className="cand-dept">{parsed.dept}</div>
                <div className="cand-slogan">{parsed.slogan}</div>
              </div>
            </div>
          );
        })}

        <div className="modal-actions">
          <button className="modal-submit-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

function VerificationFileModal({ request, token, onClose, onDecision }) {
  const [fileUrl, setFileUrl] = useState(null);
  const [fileType, setFileType] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let objectUrl;

    async function loadFile() {
      if (!request?.file_path) {
        setError("첨부 파일이 없습니다.");
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/verification/admin/${request.id}/file`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await readApiError(res, "파일을 불러오지 못했습니다."));
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setFileType(blob.type || "");
        setFileUrl(objectUrl);
      } catch (err) {
        setError(err.message);
      }
    }

    loadFile();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [request, token]);

  if (!request) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>학생증 확인</h3>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>{request.email}</div>
          <div style={{ fontSize: 13, color: "#888" }}>학번: {request.student_id}</div>
        </div>
        <div className="img-preview" style={{ height: 260 }}>
          {fileUrl && fileType.includes("pdf") && (
            <object data={fileUrl} type={fileType} width="100%" height="100%">
              <a href={fileUrl} target="_blank" rel="noreferrer">PDF 파일 열기</a>
            </object>
          )}
          {fileUrl && !fileType.includes("pdf") && (
            <img src={fileUrl} alt="학생증" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          )}
          {!fileUrl && (error || "파일 불러오는 중...")}
        </div>
        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>닫기</button>
          {request.status === "pending" && (
            <>
              <button className="modal-cancel-btn" onClick={() => onDecision(request.id, "rejected")}>거절</button>
              <button className="modal-submit-btn" onClick={() => onDecision(request.id, "approved")}>승인</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AgendaSection({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [infoTarget, setInfoTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const selectedElection = elections.find((election) => String(election.id) === String(selectedElectionId));
  const canIssueSelectedTokens = selectedElection?.status === "pending" && Boolean(selectedElection.token_contract_address);

  const loadElections = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api("/elections");
      setElections(rows || []);
      setSelectedElectionId((current) => current || (rows?.length ? String(rows[0].id) : ""));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    Promise.resolve().then(() => loadElections());
  }, [loadElections]);

  const loadElectionDetail = async (id) => {
    const data = await api(`/elections/${id}`);
    return { ...data.election, candidates: data.candidates || [] };
  };

  const filtered = elections.filter((election) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [election.title, election.description, election.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const openInfo = async (id) => {
    try {
      setInfoTarget(await loadElectionDetail(id));
    } catch (err) {
      alert(err.message);
    }
  };

  const openEdit = async (id) => {
    try {
      setEditTarget(await loadElectionDetail(id));
    } catch (err) {
      alert(err.message);
    }
  };

  const createElection = async (form) => {
    try {
      const created = await api("/elections", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          start_time: form.start_time,
          end_time: form.end_time,
        }),
      });

      for (const candidate of form.candidates) {
        if (!candidate.name.trim()) continue;
        await api(`/elections/${created.election_id}/candidates`, {
          method: "POST",
          body: JSON.stringify({
            name: candidate.name,
            description: candidate.description,
            candidate_index: candidate.candidate_index,
          }),
        });
      }

      setMessage("선거를 생성했습니다.");
      setShowCreate(false);
      await loadElections();
    } catch (err) {
      alert(err.message);
    }
  };

  const updateElection = async (form) => {
    try {
      await api(`/elections/${editTarget.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          start_time: form.start_time,
          end_time: form.end_time,
        }),
      });

      if (form.contract_address || form.token_contract_address) {
        await api(`/elections/${editTarget.id}/contract`, {
          method: "POST",
          body: JSON.stringify({
            contract_address: form.contract_address || undefined,
            token_contract_address: form.token_contract_address || undefined,
          }),
        });
      }

      if (editTarget.status === "pending") {
        const candidates = form.candidates
          .filter((candidate) => candidate.name.trim())
          .map((candidate) => ({
            name: candidate.name,
            description: candidate.description,
            candidate_index: candidate.candidate_index,
          }));

        await api(`/elections/${editTarget.id}/candidates/bulk`, {
          method: "PUT",
          body: JSON.stringify({ candidates }),
        });
      }

      setMessage("선거 정보를 수정했습니다.");
      setEditTarget(null);
      await loadElections();
    } catch (err) {
      alert(err.message);
    }
  };

  const runAction = async (label, action) => {
    try {
      await action();
      setMessage(`${label} 완료`);
      await loadElections();
    } catch (err) {
      alert(err.message);
    }
  };

  const deleteElection = async (id) => {
    if (!confirm("선거와 관련 데이터가 삭제됩니다. 계속할까요?")) return;
    await runAction("선거 삭제", () => api(`/elections/${id}`, { method: "DELETE" }));
  };

  const issueTokens = async () => {
    if (!selectedElectionId) return alert("토큰을 발급할 선거를 선택하세요.");
    if (!canIssueSelectedTokens) return alert("토큰 발급은 대기 상태이고 VotingToken 주소가 등록된 선거에서만 가능합니다.");
    await runAction("토큰 발급", () => api(`/elections/${selectedElectionId}/tokens/issue`, { method: "POST", body: JSON.stringify({}) }));
  };

  const tallyElection = async (id) => {
    await runAction("개표", () => api(`/elections/${id}/tally`, { method: "POST" }));
  };

  return (
    <>
      <div className="admin-page-header">
        <h2>선거 관리</h2>
        <p>선거 생성, 후보 등록, 컨트랙트 주소 등록, 시작/종료, 토큰 발급, 개표를 처리합니다.</p>
      </div>

      <div className="toolbar">
        <input className="search-input" type="text" placeholder="선거 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="form-select" style={{ width: 240 }} value={selectedElectionId} onChange={(event) => setSelectedElectionId(event.target.value)}>
            <option value="">토큰 발급 선거 선택</option>
            {elections.map((election) => <option key={election.id} value={election.id}>{election.title}</option>)}
          </select>
          <button className="action-btn info" onClick={issueTokens} disabled={!canIssueSelectedTokens}>토큰 일괄 발급</button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}><PlusIcon />선거 생성</button>
        </div>
      </div>

      {message && <div className="lock-notice">{message}</div>}
      {loading && <div className="lock-notice">선거 목록을 불러오는 중입니다.</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>선거명</th>
              <th>기간</th>
              <th>상태</th>
              <th>투표</th>
              <th>컨트랙트</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((election) => (
              <tr key={election.id}>
                <td><strong>{election.title}</strong><br /><span style={{ color: "#888", fontSize: 12 }}>{election.description || "-"}</span></td>
                <td>{formatDateTime(election.start_time)}<br />{formatDateTime(election.end_time)}</td>
                <td><span className={`badge ${STATUS_BADGE[election.status]}`}>{STATUS_LABEL[election.status] || election.status}</span></td>
                <td>{election.voted_count || 0} / {election.total_voters || 0}</td>
                <td>{election.contract_address ? "등록" : "미등록"}</td>
                <td>
                  <button className="action-btn info" onClick={() => openInfo(election.id)}>상세</button>
                  <button className="action-btn" onClick={() => openEdit(election.id)}>수정</button>
                  {election.status === "pending" && (
                    <button
                      className="action-btn info"
                      disabled={!election.contract_address || !election.token_contract_address}
                      onClick={() => runAction("선거 시작", () => api(`/elections/${election.id}/start`, { method: "POST" }))}
                    >
                      시작
                    </button>
                  )}
                  {election.status === "active" && <button className="action-btn info" onClick={() => runAction("선거 종료", () => api(`/elections/${election.id}/close`, { method: "POST" }))}>종료</button>}
                  {election.status === "closed" && <button className="action-btn info" onClick={() => tallyElection(election.id)}>개표</button>}
                  {election.status === "pending" && <button className="action-btn danger" onClick={() => deleteElection(election.id)}>삭제</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow colSpan={6}>선거가 없습니다.</EmptyRow>}
          </tbody>
        </table>
      </div>

      {infoTarget && <ElectionInfoModal election={infoTarget} onClose={() => setInfoTarget(null)} />}
      {editTarget && <ElectionFormModal mode="edit" election={editTarget} onClose={() => setEditTarget(null)} onSubmit={updateElection} />}
      {showCreate && <ElectionFormModal mode="create" onClose={() => setShowCreate(false)} onSubmit={createElection} />}
    </>
  );
}

function VoterSection({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [voters, setVoters] = useState([]);
  const [search, setSearch] = useState("");
  const [photoTarget, setPhotoTarget] = useState(null);
  const [message, setMessage] = useState("");
  const selectedElection = elections.find((election) => String(election.id) === String(selectedElectionId));
  const canIssueSelectedTokens = selectedElection?.status === "pending" && Boolean(selectedElection.token_contract_address);

  const loadVerifications = useCallback(async (status) => {
    try {
      const rows = await api(`/verification/admin${status === "all" ? "" : `?status=${status}`}`);
      setRequests(rows || []);
    } catch (err) {
      setMessage(err.message);
    }
  }, [api]);

  const loadElections = useCallback(async () => {
    try {
      const rows = await api("/elections");
      setElections(rows || []);
      setSelectedElectionId((current) => current || (rows?.length ? String(rows[0].id) : ""));
    } catch (err) {
      setMessage(err.message);
    }
  }, [api]);

  const loadVoters = useCallback(async (electionId) => {
    if (!electionId) return;
    try {
      const rows = await api(`/elections/${electionId}/voters`);
      setVoters(rows || []);
    } catch (err) {
      setMessage(err.message);
    }
  }, [api]);

  useEffect(() => {
    Promise.resolve().then(() => loadElections());
  }, [loadElections]);

  useEffect(() => {
    Promise.resolve().then(() => loadVerifications(tab));
  }, [loadVerifications, tab]);

  useEffect(() => {
    Promise.resolve().then(() => loadVoters(selectedElectionId));
  }, [loadVoters, selectedElectionId]);

  const decideVerification = async (id, status) => {
    try {
      await api(`/verification/admin/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(status === "approved" ? "학생 인증을 승인했습니다." : "학생 인증을 거절했습니다.");
      setPhotoTarget(null);
      await loadVerifications(tab);
      await loadVoters(selectedElectionId);
    } catch (err) {
      alert(err.message);
    }
  };

  const issueTokens = async () => {
    if (!selectedElectionId) return alert("선거를 선택하세요.");
    if (!canIssueSelectedTokens) return alert("토큰 발급은 대기 상태이고 VotingToken 주소가 등록된 선거에서만 가능합니다.");
    try {
      const result = await api(`/elections/${selectedElectionId}/tokens/issue`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setMessage(`토큰 ${result.count || 0}건 발급 완료${result.txHash ? ` (${result.txHash.slice(0, 10)}...)` : ""}`);
      await loadVoters(selectedElectionId);
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredRequests = requests.filter((request) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [request.email, request.student_id, request.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  });

  const filteredVoters = voters.filter((voter) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [voter.email, voter.student_id, voter.wallet_address, voter.verification_status].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
  });

  return (
    <>
      <div className="admin-page-header">
        <h2>유권자 관리</h2>
        <p>학생 인증 요청을 승인/거절하고 선거별 토큰 발급 및 유권자 상태를 확인합니다.</p>
      </div>

      <div className="inner-tab-bar">
        <button className={`inner-tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>승인 대기</button>
        <button className={`inner-tab ${tab === "approved" ? "active" : ""}`} onClick={() => setTab("approved")}>승인 완료</button>
        <button className={`inner-tab ${tab === "rejected" ? "active" : ""}`} onClick={() => setTab("rejected")}>거절</button>
      </div>

      <div className="toolbar">
        <input className="search-input" type="text" placeholder="이메일, 학번, 지갑 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="form-select" style={{ width: 280 }} value={selectedElectionId} onChange={(event) => setSelectedElectionId(event.target.value)}>
            <option value="">선거 선택</option>
            {elections.map((election) => <option key={election.id} value={election.id}>{election.title}</option>)}
          </select>
          <button className="action-btn info" onClick={issueTokens} disabled={!canIssueSelectedTokens}>선택 선거 토큰 발급</button>
        </div>
      </div>

      {message && <div className="lock-notice">{message}</div>}

      <div className="table-wrap" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>이메일</th>
              <th>학번</th>
              <th>상태</th>
              <th>요청일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((request) => (
              <tr key={request.id}>
                <td>{request.email}</td>
                <td>{request.student_id}</td>
                <td><span className={`badge ${request.status === "approved" ? "badge-approved" : request.status === "rejected" ? "badge-ended" : "badge-pending"}`}>{VERIFICATION_LABEL[request.status] || request.status}</span></td>
                <td>{formatDateTime(request.created_at)}</td>
                <td>
                  {request.file_path && (
                    <button className="action-btn info" onClick={() => setPhotoTarget(request)}>파일 확인</button>
                  )}
                  {request.status === "pending" && (
                    <>
                      <button className="action-btn info" onClick={() => decideVerification(request.id, "approved")}>승인</button>
                      <button className="action-btn danger" onClick={() => decideVerification(request.id, "rejected")}>거절</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filteredRequests.length === 0 && <EmptyRow colSpan={5}>인증 요청이 없습니다.</EmptyRow>}
          </tbody>
        </table>
      </div>

      <div className="admin-page-header" style={{ marginTop: 8 }}>
        <h2>선거별 유권자</h2>
        <p>선택한 선거의 토큰 발급, 투표 여부, 지갑 등록 상태를 확인합니다.</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>이메일</th>
              <th>학번</th>
              <th>인증</th>
              <th>지갑</th>
              <th>토큰</th>
              <th>투표</th>
            </tr>
          </thead>
          <tbody>
            {filteredVoters.map((voter) => (
              <tr key={voter.id}>
                <td>{voter.email}</td>
                <td>{voter.student_id || "-"}</td>
                <td>{VERIFICATION_LABEL[voter.verification_status] || voter.verification_status}</td>
                <td>{voter.wallet_address ? `${voter.wallet_address.slice(0, 8)}...${voter.wallet_address.slice(-6)}` : "미등록"}</td>
                <td>{voter.token_issued_at ? "발급" : "미발급"}</td>
                <td>{voter.has_voted ? "완료" : "미투표"}</td>
              </tr>
            ))}
            {filteredVoters.length === 0 && <EmptyRow colSpan={6}>선택한 선거의 유권자 정보가 없습니다.</EmptyRow>}
          </tbody>
        </table>
      </div>

      {photoTarget && (
        <VerificationFileModal
          request={photoTarget}
          token={token}
          onClose={() => setPhotoTarget(null)}
          onDecision={decideVerification}
        />
      )}
    </>
  );
}

export default function AdminPage({ studentId, onLogout, token }) {
  const [menu, setMenu] = useState("agenda");

  return (
    <>
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
          <span>{studentId}</span>
          <button className="admin-logout-btn" onClick={onLogout}>
            <LogoutIcon />로그아웃
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className="sidebar">
          <div className="sidebar-label">관리 메뉴</div>
          <ul className="sidebar-menu">
            <li>
              <div className={`sidebar-item ${menu === "agenda" ? "active" : ""}`} onClick={() => setMenu("agenda")}>
                <AgendaIcon />선거 관리
              </div>
            </li>
            <li>
              <div className={`sidebar-item ${menu === "voter" ? "active" : ""}`} onClick={() => setMenu("voter")}>
                <VoterIcon />유권자 관리
              </div>
            </li>
          </ul>
        </aside>

        <main className="admin-main">
          {!token && <div className="lock-notice">관리자 API 호출을 위해 다시 로그인해 주세요.</div>}
          {token && menu === "agenda" && <AgendaSection token={token} />}
          {token && menu === "voter" && <VoterSection token={token} />}
        </main>
      </div>
    </>
  );
}
