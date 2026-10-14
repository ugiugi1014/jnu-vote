import { useState, useEffect } from "react";
import { Icon } from "../components/Icons";
import { encryptVote } from '../services/ecdhService';
import { privateKeyToBigInt } from '../services/walletService';
import { generateSecret, generateVoteProof, preloadVoteProof } from '../services/zkpService';
import { castVote } from '../services/walletService';
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

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}/elections/${vote.id}/my-eligibility`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (!data.eligible) {
          alert("투표 자격이 없습니다.");
          onBack();
        } else {
          setEligible(true);
        }
      })
      .catch(() => {
        alert("자격 확인 중 오류가 발생했습니다.");
        onBack();
      });
  }, [vote.id, token]);

  const selectedCandidate = candidates.find(c => c.candidate_index === selected);

  const handleConfirm = async () => {
    if (!wallet?.privateKey) {
      alert("지갑 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try{
      const ZERO = 0n;
      const abi = ethers.AbiCoder.defaultAbiCoder();
      const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);

      // 1) 코디네이터 공개키·후보 수는 체인(VotingSystem)에서 직접 읽는다.
      //    서버가 다른 키를 내려줘도 증명의 공개 입력이 체인 값과 달라 castVote 가 거절되므로 서버 신뢰 불필요.
      setStage("선거 정보 확인 중...");
      const votingSystem = new ethers.Contract(vote.contract_address, VotingSystemABI, provider);
      const [coordPubX, coordPubY, numCandidates] = await Promise.all([
        votingSystem.coordPubX(), votingSystem.coordPubY(), votingSystem.numCandidates(),
      ]);
      if (coordPubX === ZERO || numCandidates === ZERO) {
        throw new Error("선거가 아직 설정되지 않았습니다.");
      }

      // 2) BabyJubJub ECDH + Poseidon 암호화 (임시 키는 증명 생성 후 버려짐)
      setStage("투표 암호화 중...");
      const { ciphertext, ephPriv, ephPubX, ephPubY } = await encryptVote(selected, { x: coordPubX, y: coordPubY });

      // 3) secret = Poseidon(지갑 개인키, 선거 ID) -> nullifier
      const walletPrivateKeyBigInt = privateKeyToBigInt(wallet.privateKey);
      const secret = await generateSecret(walletPrivateKeyBigInt, vote.id);

      // 4) 투표 유효성 증명 (워커) — 암호문이 유효 후보를 등록된 키로 암호화한 것임을 증명
      setStage("투표 증명 생성 중...");
      const { proof, nullifier } = await generateVoteProof({
        secret, candidateId: selected, ephPriv,
        numCandidates, coordPubX, coordPubY, ciphertext, ephPubX, ephPubY,
      });

      // 5) 체인 제출
      setStage("블록체인에 제출 중...");
      const nullifierBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(nullifier)), 32);
      const encryptedData = abi.encode(['uint256'], [ciphertext]);
      const voterPubKeyBytes = abi.encode(['uint256', 'uint256'], [ephPubX, ephPubY]);
      const connectedWallet = new ethers.Wallet(wallet.privateKey, provider);
      const tx = await castVote(connectedWallet, vote.contract_address, VotingSystemABI, nullifierBytes32, encryptedData, voterPubKeyBytes, proof);
      const voterPublicKey = { x: ephPubX.toString(), y: ephPubY.toString() };

      const confirmRes = await fetch(`${BASE_URL}/vote/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          election_id: vote.id,
          txHash: tx.hash,
          voter_public_key: JSON.stringify(voterPublicKey),
        }),
      });

      if (!confirmRes.ok) {
        const errData = await confirmRes.json().catch(() => null);
        throw new Error(errData?.message || "vote/confirm 실패 (tx는 체인에 기록됨)");
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
        <button className="btn btn-vote" disabled={selected === null || eligible !== true || !wallet} onClick={() => setShowModal(true)}>투표하기</button>
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
