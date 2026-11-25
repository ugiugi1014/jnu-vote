// 공격 시도: 데모 체인이 켜져 있으면 실제 컨트랙트에 보내 거절되는 것을 보여주고,
// 꺼져 있으면 무슨 일이 일어나는지 설명만 보여준다 (그대로 '체인에서 확인 가능' 안내)
import { useState } from "react";
import { ethers } from "ethers";
import VotingSystemABI from "../../abi/VotingSystem.json";

const API = import.meta.env.VITE_API_BASE_URL;
const coder = ethers.AbiCoder.defaultAbiCoder();
const ZERO_PROOF = { a: [0, 0], b: [[0, 0], [0, 0]], c: [0, 0] };
const TALLY_VERIFIER_ABI = [
  "function verifyProof(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, uint[160] _pubSignals) view returns (bool)",
];

const ATTACKS = {
  double: {
    title: "같은 학생이 한 번 더 투표",
    what: "이미 블록체인에 기록된 중복투표방지 값으로 투표를 한 번 더 보냅니다.",
    expect: "블록체인이 'duplicate nullifier'(이미 쓰인 중복투표방지 값)로 거절합니다. 같은 학생은 같은 투표권을 쓰므로 이 값이 같아질 수밖에 없습니다.",
  },
  outsider: {
    title: "명단에 없는 사람이 투표",
    what: "블록체인의 유권자 명단에 없는 명단 요약값으로 투표를 보냅니다.",
    expect: "블록체인이 'unknown merkle root'(모르는 명단)로 거절합니다. 명단 밖 사람은 블록체인이 아는 명단으로 증명을 만들 수 없습니다.",
  },
  tally: {
    title: "관리자가 득표를 바꿔서 기록",
    what: "블록체인에 실제로 기록된 개표 증명을 꺼내, 득표 하나만 1 바꿔서 다시 확인해 봅니다.",
    expect: "원래 값은 통과하고, 바꾼 값은 실패합니다. 개표 결과는 이 확인을 통과해야만 기록됩니다.",
  },
};

async function connect() {
  const info = await fetch(`${API}/demo/info`).then((r) => r.json()).catch(() => null);
  if (!info?.enabled) throw new Error("demo-off");
  const provider = new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL);
  await provider.getBlockNumber();
  const elections = await fetch(`${API}/elections`).then((r) => r.json());
  return { provider, elections: (elections || []).filter((e) => e.contract_address) };
}

const reasonOf = (err) => err?.reason || err?.revert?.args?.[0] || err?.shortMessage || err?.message || String(err);

async function runAttack(kind) {
  const { provider, elections } = await connect();
  if (kind === "double" || kind === "outsider") {
    const e = elections.find((x) => x.status === "active");
    if (!e) return { info: "진행 중인 선거가 없습니다. 데모에서 '진행 중' 선거가 있을 때 해 보세요." };
    const vs = new ethers.Contract(e.contract_address, VotingSystemABI, provider);
    let nullifier;
    let root = await vs.getLastRoot();
    if (kind === "double") {
      const cast = await vs.queryFilter(vs.filters.VoteCast(), 0);
      if (!cast.length) return { info: "아직 체인에 표가 없습니다. 데모에서 학생 한 명으로 먼저 투표한 뒤 해 보세요." };
      nullifier = cast[0].args.nullifier;
    } else {
      nullifier = ethers.hexlify(ethers.randomBytes(32));
      root = BigInt(ethers.hexlify(ethers.randomBytes(31)));
    }
    try {
      await vs.castVote.staticCall(nullifier, root, coder.encode(["uint256"], [1]), coder.encode(["uint256", "uint256"], [1, 2]), ZERO_PROOF.a, ZERO_PROOF.b, ZERO_PROOF.c);
      return { ok: false, lines: ["예상과 달리 통과했습니다."] };
    } catch (err) {
      return {
        ok: true,
        lines: [
          `선거: ${e.title}`,
          `보낸 중복투표방지 값: ${String(nullifier).slice(0, 14)}…`,
          `블록체인 응답: 거절 — "${reasonOf(err)}"`,
        ],
      };
    }
  }
  if (kind === "tally") {
    const e = elections.find((x) => x.status === "tallied");
    if (!e) return { info: "개표가 끝난 선거가 없습니다. 데모에서 관리자로 종료·개표한 뒤 해 보세요." };
    const vs = new ethers.Contract(e.contract_address, VotingSystemABI, provider);
    const recs = await vs.queryFilter(vs.filters.TallyBatchRecorded(), 0);
    const last = recs[recs.length - 1];
    const tx = await provider.getTransaction(last.transactionHash);
    const parsed = vs.interface.parseTransaction({ data: tx.data });
    // recordTallyBatch(batchIndex, candidateIds, voteCounts, pA, pB, pC, pubSignals)
    const [, , , rA, rB, rC, pubSignals] = parsed.args;
    const pA = rA.map((x) => BigInt(x));
    const pB = rB.map((row) => row.map((x) => BigInt(x)));
    const pC = rC.map((x) => BigInt(x));
    const verifier = new ethers.Contract(await vs.tallyVerifier(), TALLY_VERIFIER_ABI, provider);
    const signals = Array.from(pubSignals, (x) => BigInt(x));
    const original = await verifier.verifyProof(pA, pB, pC, signals);
    const forged = [...signals];
    forged[155] = forged[155] + 1n; // 첫 번째 후보 득표 +1
    const changed = await verifier.verifyProof(pA, pB, pC, forged);
    return {
      ok: original && !changed,
      lines: [
        `선거: ${e.title} (배치 ${last.args.batchIndex})`,
        `기록된 그대로 확인: ${original ? "통과" : "실패"}`,
        `첫 번째 후보 득표 ${signals[155]} → ${forged[155]} 로 바꿔 확인: ${changed ? "통과" : "실패"}`,
      ],
    };
  }
  return null;
}

export default function AttackPanel({ kinds }) {
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState("");

  const attempt = async (kind) => {
    setBusy(kind);
    try {
      const r = await runAttack(kind);
      setResults((s) => ({ ...s, [kind]: { ...r, live: true } }));
    } catch (err) {
      const off = err.message === "demo-off" || /fetch|network|ECONNREFUSED|could not detect/i.test(err.message || "");
      setResults((s) => ({ ...s, [kind]: off ? { live: false } : { live: true, ok: false, lines: [reasonOf(err)] } }));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="hiw-attacks">
      {kinds.map((k) => {
        const a = ATTACKS[k];
        const r = results[k];
        return (
          <div key={k} className="hiw-attack">
            <div className="hiw-attack-head">
              <strong>{a.title}</strong>
              <button className="hiw-btn danger" disabled={!!busy} onClick={() => attempt(k)}>
                {busy === k ? "보내는 중…" : "시도해 보기"}
              </button>
            </div>
            <p className="hiw-hint">{a.what}</p>
            {r && r.live === false && (
              <div className="hiw-verdict info">
                데모가 꺼져 있어 설명으로 대신합니다. {a.expect} 데모를 켜면 실제 블록체인 응답을 볼 수 있습니다.
              </div>
            )}
            {r?.info && <div className="hiw-verdict info">{r.info}</div>}
            {r?.lines && (
              <div className={`hiw-verdict ${r.ok ? "ok" : "bad"}`}>
                <div className="hiw-live">실제 블록체인 응답</div>
                {r.lines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
