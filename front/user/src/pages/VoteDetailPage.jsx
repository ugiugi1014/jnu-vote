import { useState, useEffect } from "react";
import { Icon } from "../components/Icons";
import { encryptVote } from '../services/ecdhService';
import { generateVoteProof, preloadVoteProof } from '../services/zkpService';
import { loadSecret, createSecret, computeCommitment, buildMerkleProof } from '../services/voterIdService';
import { ethers } from 'ethers';
import VotingSystemABI from '../abi/VotingSystem.json';
//import { CANDIDATES } from "../data/mockData"; //후보자 목록 mock 데이터
import "../styles/VoteDetailPage.css";

const LOGO = "/src/jejun.png";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).replace("T", " ").slice(0, 16);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function VoteDetailPage({ vote, onBack, wallet, token }) {
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDonePopup, setShowDonePopup] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [eligible, setEligible] = useState(null); // null=확인중
  const [idStatus, setIdStatus] = useState("checking"); // checking | ready | registering | no_key | error
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState("");

  // 증명용 회로 파일을 미리 받아둔다 (워커에서 백그라운드로)
  useEffect(() => {
    preloadVoteProof();
  }, []);

  useEffect(() => {
    fetch(`${BASE_URL}/elections/${vote.id}/candidates`)
      .then(r => r.json())
      .then(data => setCandidates(data || []))
      .catch(() => alert("후보자 목록 로딩 실패"));
  }, [vote.id]);

  // 자격 확인 + 익명 투표 키 준비
  //  - 이 선거에 처음 들어오면: 브라우저가 랜덤 secret 생성·저장 -> Poseidon(secret) 만 서버에 보내 등록
  //  - 이미 등록됐는데 이 브라우저에 키가 없으면: 투표 불가 (재등록하면 2표가 가능해지므로 막혀 있음)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/elections/${vote.id}/my-eligibility`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (!data.eligible) {
          alert("투표 자격이 없습니다.");
          onBack();
          return;
        }
        setEligible(true);
        const electionAddress = data.contract_address || vote.contract_address;
        const existing = loadSecret(electionAddress);
        if (data.registered) {
          setIdStatus(existing ? "ready" : "no_key");
          return;
        }
        setIdStatus("registering");
        const secret = existing ?? createSecret(electionAddress);
        const commitment = await computeCommitment(secret);
        const reg = await fetch(`${BASE_URL}/elections/${vote.id}/register-commitment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ commitment: commitment.toString() }),
        });
        if (!reg.ok) throw new Error((await reg.json().catch(() => null))?.message || "등록 실패");
        if (!cancelled) setIdStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setIdStatus("error");
          alert("투표 준비 중 오류가 발생했습니다: " + err.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [vote.id, token]);

  const selectedCandidate = candidates.find(c => c.candidate_index === selected);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try{
      const ZERO = 0n;
      const abi = ethers.AbiCoder.defaultAbiCoder();
      const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
      const electionAddress = vote.contract_address;

      const secret = loadSecret(electionAddress);
      if (!secret) throw new Error("이 브라우저에 이 선거의 투표 키가 없습니다.");

      // 1) 선거 정보·유권자 트리는 체인(VotingSystem)에서 직접 읽는다 (서버 신뢰 불필요)
      setStage("선거 정보 확인 중...");
      const votingSystem = new ethers.Contract(electionAddress, VotingSystemABI, provider);
      const [coordPubX, coordPubY, numCandidates, commitments] = await Promise.all([
        votingSystem.coordPubX(), votingSystem.coordPubY(), votingSystem.numCandidates(), votingSystem.getCommitments(),
      ]);
      if (coordPubX === ZERO || numCandidates === ZERO) {
        throw new Error("선거가 아직 설정되지 않았습니다.");
      }

      // 2) 내 commitment 의 머클 경로 (어느 leaf 인지는 증명 안에 숨겨진다)
      const leaf = await computeCommitment(secret);
      const { root, pathElements, pathIndices } = await buildMerkleProof(commitments, leaf);

      // 3) BabyJubJub ECDH + Poseidon 암호화 (임시 키는 증명 생성 후 버려짐)
      setStage("투표 암호화 중...");
      const { ciphertext, ephPriv, ephPubX, ephPubY } = await encryptVote(selected, { x: coordPubX, y: coordPubY });

      // 4) 투표 증명 (워커): 등록된 유권자 + 유효 후보를 등록된 코디 키로 암호화 + nullifier
      setStage("투표 증명 생성 중...");
      const { proof, nullifier } = await generateVoteProof({
        secret, pathElements, pathIndices, candidateId: selected, ephPriv,
        merkleRoot: root, scope: BigInt(electionAddress), numCandidates,
        coordPubX, coordPubY, ciphertext, ephPubX, ephPubY,
      });

      // 5) relayer 로 제출 — 로그인 토큰을 보내지 않는다 (서버가 누가 보냈는지 알 수 없게)
      setStage("블록체인에 제출 중...");
      const res = await fetch(`${BASE_URL}/vote/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          election_id: vote.id,
          nullifier: ethers.zeroPadValue(ethers.toBeHex(BigInt(nullifier)), 32),
          merkleRoot: root.toString(),
          encryptedData: abi.encode(['uint256'], [ciphertext]),
          voterPubKey: abi.encode(['uint256', 'uint256'], [ephPubX, ephPubY]),
          pA: proof.pi_a.slice(0, 2),
          // pi_b inner pair swap (snarkjs exportSolidityCallData 규약과 동일)
          pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
          pC: proof.pi_c.slice(0, 2),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const already = data?.reason?.includes?.("duplicate nullifier");
        throw new Error(already ? "이미 투표했습니다." : (data?.message || "투표 제출 실패"));
      }

      setShowModal(false);
      setShowDonePopup(true);
    } catch (err){
      alert("투표 처리 중 오류가 발생했습니다: " + err.message);
    } finally {
      setIsSubmitting(false);
      setStage("");
    }
  };

  const handleDoneConfirm = () => {
    setShowDonePopup(false);
    onBack();
  };

  return (
    <>
      <nav className="nav-bar">
        <button className="nav-back" onClick={onBack}><Icon.ArrowLeft />목록으로</button>
        <img src={LOGO} alt="제주대학교 로고" className="nav-logo-img" />
      </nav>

      <main className="main-narrow">
        <div className="info-card">
          <div className="info-icon"><Icon.Ballot /></div>
          <div className="info-body">
            <div className="info-title">{vote.title}</div>
            <div className="info-deadline">투표 마감: {formatDateTime(vote.end_time)}</div>
            <div className="info-desc">{vote.description}</div>
          </div>
        </div>

        <div className="warning-banner">
          <Icon.Warn />
          투표는 한 번만 가능하며, 제출 후에는 수정할 수 없습니다. 신중하게 선택해주세요.
        </div>

        {idStatus === "registering" && (
          <div className="warning-banner">익명 투표 키를 준비하고 있습니다...</div>
        )}
        {idStatus === "no_key" && (
          <div className="warning-banner">
            <Icon.Warn />
            이 선거의 투표 키가 이 브라우저에 없습니다. 처음 등록한 브라우저(기기)에서 투표해주세요.
          </div>
        )}

        <div className="section-title">후보자 선택</div>
        {candidates.map(c => (
          <div
            key={c.id}
            className={`candidate-card ${selected === c.candidate_index ? "selected" : ""}`}
            onClick={() => setSelected(c.candidate_index)}
          >
            <div className="select-indicator" />
            <div className="candidate-number">{c.candidate_index}</div>
            <div className="candidate-info">
              <div className="candidate-name">{c.name}</div>
              <div className="candidate-dept">{c.description}</div>
              {/*<div className="candidate-slogan">{c.slogan}</div>*/}
            </div>
          </div>
        ))}
      </main>

      {/* 하단 버튼 */}
      <div className="bottom-actions-inner">
        <button className="btn btn-cancel" onClick={() => setSelected(null)}>취소</button>
        <button className="btn btn-vote" disabled={selected === null || eligible !== true || idStatus !== "ready"} onClick={() => setShowModal(true)}>투표하기</button>
      </div>

      {/* 투표 확인 모달 */}
      {showModal && selectedCandidate && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">투표 확인</div>
            <div className="modal-subtitle">선택한 후보로 투표하시겠습니까?</div>
            <div className="modal-candidate-box">
              <div className="modal-candidate-name">{selectedCandidate.name}</div>
              <div className="modal-candidate-dept">{selectedCandidate.description}</div>
            </div>
            <div className="modal-warning">
              <Icon.Warn color="#b45309" />투표 후에는 변경할 수 없습니다
            </div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={() => setShowModal(false)}>취소</button>
              <button className="modal-btn modal-btn-confirm" disabled={isSubmitting} onClick={handleConfirm}>
                {isSubmitting ? (stage || "처리중...") : "확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 투표 완료 팝업 */}
      {showDonePopup && (
        <div className="modal-overlay">
          <div className="modal" style={{ textAlign: "center" }}>
            <div className="done-icon" style={{ margin: "0 auto 16px" }}><Icon.Check /></div>
            <div className="modal-title">투표가 완료되었습니다</div>
            <div className="modal-subtitle">소중한 한 표가 반영되었습니다.</div>
            <div className="modal-actions" style={{ marginTop: 8 }}>
              <button className="modal-btn modal-btn-confirm" onClick={handleDoneConfirm}>확인</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
