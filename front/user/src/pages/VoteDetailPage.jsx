import { useState, useEffect } from "react";
import { Icon } from "../components/Icons";
import { encryptVote } from '../services/ecdhService';
import { generateVoteProof, preloadVoteProof } from '../services/zkpService';
import {
  computeCommitment, buildMerkleProof, deriveSecret, resolveSecret, loadSeed, saveSeed,
  bytesToField, newRecoveryBytes, encodeRecoveryCode, decodeRecoveryCode,
} from '../services/voterIdService';
import { isPasskeyLikelySupported, createPasskeySeed, restorePasskeySeed, PasskeyPrfUnsupportedError } from '../services/passkeyService';
import { ethers } from 'ethers';
import VotingSystemABI from '../abi/VotingSystem.json';
import { getDemoInfo } from '../services/demoInfo';
//import { CANDIDATES } from "../data/mockData"; //후보자 목록 mock 데이터
import "../styles/VoteDetailPage.css";

const LOGO = "/jejun.png";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;

const ELIGIBILITY_REASON = {
  not_in_voter_list: "이 선거의 유권자 명단에 없습니다.",
  not_verified: "재학증명서 인증이 필요합니다.",
  wallet_not_registered: "지갑 등록이 필요합니다. 다시 로그인해주세요.",
  contract_not_deployed: "아직 선거 준비 중입니다 (컨트랙트 미배포).",
  election_not_active: "지금은 이 선거에 참여할 수 없습니다.",
};

// 체인의 유권자 트리 (등록 순서대로의 commitment 배열)
async function readChainCommitments(electionAddress) {
  const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
  const votingSystem = new ethers.Contract(electionAddress, VotingSystemABI, provider);
  return (await votingSystem.getCommitments()).map((c) => BigInt(c));
}

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

export default function VoteDetailPage({ vote, onBack, token }) {
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDonePopup, setShowDonePopup] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [eligible, setEligible] = useState(null); // null=확인중
  // checking | setup | registering | ready | no_key | error
  const [idStatus, setIdStatus] = useState("checking");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState("");
  const [electionInfo, setElectionInfo] = useState({ address: vote.contract_address, status: vote.status, canReplace: false });
  const [passkeyOk, setPasskeyOk] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);       // 투표권 교체(시작 전 재등록)
  const [recovery, setRecovery] = useState(null);              // { bytes, code } 새 복구 코드 표시용
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [restoreInput, setRestoreInput] = useState("");
  const [autoKey, setAutoKey] = useState(false);               // 전시 모드: 투표권을 화면 없이 자동으로 만든 경우

  // 증명용 회로 파일을 미리 받아둔다 (워커에서 백그라운드로)
  useEffect(() => {
    preloadVoteProof();
    isPasskeyLikelySupported().then(setPasskeyOk).catch(() => setPasskeyOk(false));
  }, []);

  useEffect(() => {
    fetch(`${BASE_URL}/elections/${vote.id}/candidates`)
      .then(r => r.json())
      .then(data => setCandidates(data || []))
      .catch(() => alert("후보자 목록 로딩 실패"));
  }, [vote.id]);

  // 자격 확인 + 익명 투표권 준비
  //  - 미등록 + 캐시된 시드 있음: 같은 시드로 이 선거의 secret 을 만들어 바로 등록 (다른 선거와 같은 패스키/복구 코드 사용)
  //  - 미등록 + 시드 없음: 패스키(권장) 또는 복구 코드로 투표권을 만들게 한다 (버튼 클릭 필요: 패스키는 사용자 동작이 있어야 뜬다)
  //  - 등록됨 + 이 브라우저에 키 없음: 패스키/복구 코드로 복원. 시작 전이면 새 키로 교체도 가능
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
          alert(ELIGIBILITY_REASON[data.reason] || "투표 자격이 없습니다.");
          onBack();
          return;
        }
        setEligible(true);
        const address = data.contract_address || vote.contract_address;
        setElectionInfo({ address, status: data.status || vote.status, canReplace: !!data.can_replace });

        const secret = await resolveSecret(address);
        if (data.registered) {
          if (!secret) { setIdStatus("no_key"); return; }
          // 이 브라우저의 키가 실제로 등록된 것인지 체인에서 확인 (다른 패스키로 만든 경우 등)
          const mine = await computeCommitment(secret);
          const onChain = await readChainCommitments(address);
          if (!cancelled) setIdStatus(onChain.includes(mine) ? "ready" : "no_key");
          return;
        }
        if (secret) {
          await registerSecret(address, secret, false);
          if (!cancelled) setIdStatus("ready");
          return;
        }
        // 전시 모드: 공용 기기라 패스키·복구 코드 단계를 건너뛰고 투표권을 바로 만든다 (로그아웃하면 지워짐)
        if ((await getDemoInfo()).exhibition) {
          if (cancelled) return;
          setIdStatus("registering");
          const seed = bytesToField(newRecoveryBytes());
          saveSeed(seed, "exhibition");
          await registerSecret(address, await deriveSecret(seed, address), false);
          if (!cancelled) { setAutoKey(true); setIdStatus("ready"); }
          return;
        }
        setIdStatus("setup");
      } catch (err) {
        if (!cancelled) {
          setIdStatus("error");
          alert("투표 준비 중 오류가 발생했습니다: " + err.message);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vote.id, token]);

  // commitment 를 서버에 보내 유권자 트리에 등록 (replace=true 면 기존 키 교체)
  async function registerSecret(address, secret, replace) {
    const commitment = await computeCommitment(secret);
    const reg = await fetch(`${BASE_URL}/elections/${vote.id}/register-commitment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ commitment: commitment.toString(), replace }),
    });
    if (!reg.ok) throw new Error((await reg.json().catch(() => null))?.message || "등록 실패");
  }

  async function finishSetup(seed, source, replace = replaceMode) {
    const address = electionInfo.address;
    setIdStatus("registering");
    saveSeed(seed, source);
    const secret = await deriveSecret(seed, address);
    await registerSecret(address, secret, replace);
    setReplaceMode(false);
    setRecovery(null);
    setRecoverySaved(false);
    setIdStatus("ready");
  }

  const runKeyAction = async (fn) => {
    if (keyBusy) return;
    setKeyBusy(true);
    setKeyError("");
    try {
      await fn();
    } catch (err) {
      if (err?.name === "NotAllowedError") setKeyError("패스키 인증이 취소되었습니다.");
      else if (err instanceof PasskeyPrfUnsupportedError) {
        setPasskeyOk(false);
        setKeyError("이 기기에서는 패스키 방식을 쓸 수 없습니다. 복구 코드 방식을 사용해주세요.");
      } else setKeyError(err.message || String(err));
      setIdStatus((s) => (s === "registering" ? (replaceMode ? "no_key" : "setup") : s));
    } finally {
      setKeyBusy(false);
    }
  };

  // 새 투표권: 패스키
  const setupWithPasskey = () => runKeyAction(async () => {
    const out = await createPasskeySeed("제주대 전자투표 유권자");
    const seed = bytesToField(out);
    if (!seed) throw new Error("패스키 비밀값 오류");
    await finishSetup(seed, "passkey");
  });

  // 새 투표권: 복구 코드 (먼저 보여주고, 저장했다고 확인한 뒤 등록)
  const startRecoverySetup = () => runKeyAction(async () => {
    const bytes = newRecoveryBytes();
    setRecovery({ bytes, code: await encodeRecoveryCode(bytes) });
    setRecoverySaved(false);
  });
  const confirmRecoverySetup = () => runKeyAction(async () => {
    await finishSetup(bytesToField(recovery.bytes), "code");
  });
  const downloadRecovery = () => {
    const blob = new Blob(
      [`제주대학교 전자투표 복구 코드\n\n${recovery.code}\n\n이 코드가 있으면 다른 기기에서도 투표권을 되찾을 수 있습니다.\n다른 사람에게 보여주지 마세요.\n`],
      { type: "text/plain;charset=utf-8" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jnu-vote-recovery-code.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // 복원: 시드로 만든 commitment 가 체인 트리에 있는지 확인한 뒤에만 캐시에 저장
  async function restoreFromSeed(seed, source) {
    const secret = await deriveSecret(seed, electionInfo.address);
    const mine = await computeCommitment(secret);
    const onChain = await readChainCommitments(electionInfo.address);
    if (!onChain.includes(mine)) {
      throw new Error(source === "passkey"
        ? "이 패스키로 등록한 투표권이 아닙니다. 처음 등록할 때 쓴 패스키를 골라주세요."
        : "이 복구 코드로 등록한 투표권이 아닙니다.");
    }
    saveSeed(seed, source);
    setIdStatus("ready");
  }
  const restoreWithPasskey = () => runKeyAction(async () => {
    const seed = bytesToField(await restorePasskeySeed());
    if (!seed) throw new Error("패스키 비밀값 오류");
    await restoreFromSeed(seed, "passkey");
  });
  const restoreWithCode = () => runKeyAction(async () => {
    const seed = bytesToField(await decodeRecoveryCode(restoreInput));
    if (!seed) throw new Error("복구 코드가 올바르지 않습니다.");
    await restoreFromSeed(seed, "code");
  });

  // 시작 전에만: 기존 키를 버리고 새 키로 교체
  const beginReplace = () => {
    setReplaceMode(true);
    setKeyError("");
    const cached = loadSeed();
    if (cached) {
      runKeyAction(() => finishSetup(cached.seed, cached.source, true));
      return;
    }
    setIdStatus("setup");
  };

  const selectedCandidate = candidates.find(c => c.candidate_index === selected);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try{
      const ZERO = 0n;
      const abi = ethers.AbiCoder.defaultAbiCoder();
      const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
      const electionAddress = vote.contract_address;

      const secret = await resolveSecret(electionAddress);
      if (!secret) throw new Error("이 브라우저에 이 선거의 투표권이 없습니다.");

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

        {electionInfo.status === "pending" && (
          <div className="warning-banner">
            아직 투표 시작 전입니다. 지금 투표권을 등록해 두면 시작 후 바로 투표할 수 있습니다.
          </div>
        )}
        {idStatus === "registering" && (
          <div className="warning-banner">익명 투표권을 등록하고 있습니다...</div>
        )}
        {idStatus === "ready" && autoKey && electionInfo.status !== "pending" && (
          <div className="warning-banner">투표권이 만들어져 유권자 명단에 등록됐습니다. 후보를 골라 투표하세요.</div>
        )}
        {idStatus === "ready" && electionInfo.status === "pending" && (
          <div className="warning-banner">투표권 등록이 끝났습니다. 투표가 시작되면 다시 들어와 주세요.</div>
        )}

        {idStatus === "setup" && !recovery && (
          <div className="key-panel">
            <div className="section-title">{replaceMode ? "새 투표권 만들기" : "투표권 만들기"}</div>
            <p className="key-panel-desc">
              익명 투표를 위해 나만 아는 투표권을 만듭니다. 서버는 이 투표권을 모르며, 잃어버리면 이 선거에 투표할 수 없습니다.
            </p>
            {passkeyOk && (
              <button className="btn btn-vote key-btn" disabled={keyBusy} onClick={setupWithPasskey}>
                패스키로 만들기 (권장: 지문·얼굴 인증, 기기 간 자동 동기화)
              </button>
            )}
            <button className="btn btn-cancel key-btn" disabled={keyBusy} onClick={startRecoverySetup}>
              복구 코드로 만들기
            </button>
          </div>
        )}

        {idStatus === "setup" && recovery && (
          <div className="key-panel">
            <div className="section-title">복구 코드를 저장하세요</div>
            <p className="key-panel-desc">
              다른 기기에서 투표하거나 브라우저 기록을 지운 뒤에는 이 코드가 있어야 투표권을 되찾을 수 있습니다.
              다른 사람에게 보여주지 마세요.
            </p>
            <div className="recovery-code">{recovery.code}</div>
            <div className="key-actions">
              <button className="btn btn-cancel key-btn" onClick={() => navigator.clipboard?.writeText(recovery.code)}>복사</button>
              <button className="btn btn-cancel key-btn" onClick={downloadRecovery}>파일로 저장</button>
            </div>
            <label className="key-check">
              <input type="checkbox" checked={recoverySaved} onChange={(e) => setRecoverySaved(e.target.checked)} />
              복구 코드를 안전한 곳에 저장했습니다
            </label>
            <button className="btn btn-vote key-btn" disabled={!recoverySaved || keyBusy} onClick={confirmRecoverySetup}>
              등록하기
            </button>
          </div>
        )}

        {idStatus === "no_key" && (
          <div className="key-panel">
            <div className="warning-banner">
              <Icon.Warn />
              이 브라우저에 이 선거의 투표권이 없습니다. 등록할 때 쓴 패스키나 복구 코드로 되찾아주세요.
            </div>
            {passkeyOk && (
              <button className="btn btn-vote key-btn" disabled={keyBusy} onClick={restoreWithPasskey}>패스키로 되찾기</button>
            )}
            <div className="key-actions">
              <input
                className="recovery-input"
                placeholder="복구 코드 (XXXX-XXXX-...)"
                value={restoreInput}
                onChange={(e) => setRestoreInput(e.target.value)}
              />
              <button className="btn btn-cancel key-btn" disabled={keyBusy || !restoreInput.trim()} onClick={restoreWithCode}>
                복구 코드로 되찾기
              </button>
            </div>
            {electionInfo.canReplace && (
              <>
                <p className="key-panel-desc">
                  패스키와 복구 코드를 모두 잃었다면, 투표 시작 전까지는 새 투표권으로 다시 등록할 수 있습니다 (기존 투표권은 무효가 됩니다).
                </p>
                <button className="btn btn-cancel key-btn" disabled={keyBusy} onClick={beginReplace}>새 투표권으로 다시 등록</button>
              </>
            )}
          </div>
        )}
        {keyError && <div className="warning-banner"><Icon.Warn />{keyError}</div>}

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
        <button className="btn btn-vote" disabled={selected === null || eligible !== true || idStatus !== "ready" || electionInfo.status !== "active"} onClick={() => setShowModal(true)}>투표하기</button>
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
