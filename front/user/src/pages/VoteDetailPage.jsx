import { useState, useEffect } from "react";
import { Icon } from "../components/Icons";
import { generateECDHKeyPair, deriveSharedKeyAndDispose, importCoordPublicKey, exportPublicKey, exportSharedKeyAsBigInt } from '../services/ecdhService';
import { privateKeyToBigInt } from '../services/walletService';
import { generateSecret, generateVoteProof } from '../services/zkpService';
import { encryptCandidate } from '../services/poseidonService';
//import { CANDIDATES } from "../data/mockData"; //후보자 목록 mock 데이터
import "../styles/VoteDetailPage.css";

const LOGO = "/src/jejun.png";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function VoteDetailPage({ vote, onBack, wallet }) {
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDonePopup, setShowDonePopup] = useState(false);
  const [candidates, setCandidates] = useState([]);

  useEffect(() => {
    fetch(`${BASE_URL}/elections/${vote.id}/candidates`)
      .then(r => r.json())
      .then(data => setCandidates(data || []))
      .catch(() => alert("후보자 목록 로딩 실패"));
  }, [vote.id]);

  const selectedCandidate = candidates.find(c => c.candidate_index === selected);
  const maxCandidate = candidates.length;

  const handleConfirm = async () => {
    try{
      const coordJWK = await fetch(`${BASE_URL}/elections/${vote.id}/coordinator/public-key`).then(r => r.json()).catch(() => alert("투표처리 중 오류가 발생했습니다. 다시 시도해주세요"));
      //const coordJWK = {"kty":"EC","x":"UyY8smusO47QR3tLqw8l1jvax1o3qtWkPIrC-MsYNq4","y":"aFHrGgBitQDva9i_UWEgEcn3cM5T2JlY4GunXMQvQ18","crv":"P-256"}; // mock

      //키쌍 생성
      const keyPair = await generateECDHKeyPair();
      //관리자 공개키 가져오기
      const coordPublicKey = await importCoordPublicKey(coordJWK);
      //투표자 공개키 가져오기
      const voterPublicKey = await exportPublicKey(keyPair.publicKey);
      //공유키 생성
      const sharedKey = await deriveSharedKeyAndDispose(keyPair, coordPublicKey);
      //공유키 타입변환
      const sharedKeyBigInt = await exportSharedKeyAsBigInt(sharedKey);
      //지갑 키 가져오기
      const walletPrivateKeyBigInt = privateKeyToBigInt(wallet.privateKey);
      //지갑 생성 및 지갑을 secret으로 사용
      const secret = await generateSecret(walletPrivateKeyBigInt, vote.id);
      //투표 유효성 검사
      const { proof, nullifier } = await generateVoteProof(secret, selected, maxCandidate);
      // TODO: castVote(connectedWallet, contractAddress, abi, nullifier, proof, ciphertext) 연결
      const { ciphertext, nonce } = await encryptCandidate(selected, sharedKeyBigInt);

      console.log("공유키:", sharedKey);
      console.log("투표자 공개키:", voterPublicKey);
      // 다음: Poseidon 암호화 → snarkjs proof → 체인 제출
      setShowModal(false);
      setShowDonePopup(true);
    } catch (err){

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
            <div className="info-deadline">투표 마감: {vote.end_time}</div>
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
        <button className="btn btn-vote" disabled={selected === null} onClick={() => setShowModal(true)}>투표하기</button>
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
              <button className="modal-btn modal-btn-confirm" onClick={handleConfirm}>확인</button>
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