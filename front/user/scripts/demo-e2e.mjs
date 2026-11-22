// 데모 환경 처음부터 끝까지 자동 점검 (브라우저 대신 프론트 코드를 Node 에서 그대로 사용)
//   학생 로그인 → 지갑 등록 → 투표 키(복구 코드) 등록 → 투표 증명 → relay 제출
//   + 이중투표 거절, 명단 밖 학생 거절, (선택) 관리자 종료·개표·결과 확인
// 사용: node scripts/demo-e2e.mjs [--tally]
//   API (기본 http://localhost:8080/api), RPC (기본 http://localhost:8545), ACCOUNTS (기본 ../../demo/accounts.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { groth16 } from 'snarkjs';
import { createWallet } from '../src/services/walletService.js';
import { encryptVote } from '../src/services/ecdhService.js';
import {
  bytesToField, newRecoveryBytes, deriveSecret, computeCommitment, buildMerkleProof,
} from '../src/services/voterIdService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const API = process.env.API || 'http://localhost:8080/api';
const RPC = process.env.RPC || 'http://localhost:8545';
const accounts = JSON.parse(fs.readFileSync(process.env.ACCOUNTS || path.join(here, '../../../demo/accounts.json'), 'utf8'));
const abi = JSON.parse(fs.readFileSync(path.join(here, '../src/abi/VotingSystem.json'), 'utf8'));
const WASM = path.join(here, '../public/voteProof.wasm');
const ZKEY = path.join(here, '../public/voteProof_final.zkey');
const coder = ethers.AbiCoder.defaultAbiCoder();
const provider = new ethers.JsonRpcProvider(RPC);

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

async function call(method, p, { token, body } = {}) {
  const r = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function login(email) {
  const s = await call('POST', '/auth/send-code', { body: { email } });
  if (!s.data.demo_code) throw new Error(`데모 코드 없음: ${email} ${JSON.stringify(s.data)}`);
  const v = await call('POST', '/auth/verify-code', { body: { email, code: s.data.demo_code } });
  const wallet = await createWallet(email, v.data.serverSecret);
  await call('POST', '/auth/wallet', { token: v.data.token, body: { wallet_address: wallet.address } });
  return v.data.token;
}

async function vote(election, secret, candidateId) {
  const vs = new ethers.Contract(election.contract_address, abi, provider);
  const [cx, cy, nc, commitments] = await Promise.all([vs.coordPubX(), vs.coordPubY(), vs.numCandidates(), vs.getCommitments()]);
  const leaf = await computeCommitment(secret);
  const { root, pathElements, pathIndices } = await buildMerkleProof(commitments, leaf);
  const { ciphertext, ephPriv, ephPubX, ephPubY } = await encryptVote(candidateId, { x: cx, y: cy });
  const input = Object.fromEntries(Object.entries({
    secret, pathElements, pathIndices, candidateId, ephPriv, merkleRoot: root, scope: BigInt(election.contract_address),
    numCandidates: nc, coordPubX: cx, coordPubY: cy, ciphertext, ephPubX, ephPubY,
  }).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)]));
  const { proof, publicSignals } = await groth16.fullProve(input, WASM, ZKEY);
  return call('POST', '/vote/relay', {
    body: {
      election_id: election.id,
      nullifier: ethers.zeroPadValue(ethers.toBeHex(BigInt(publicSignals[0])), 32),
      merkleRoot: root.toString(),
      encryptedData: coder.encode(['uint256'], [ciphertext]),
      voterPubKey: coder.encode(['uint256', 'uint256'], [ephPubX, ephPubY]),
      pA: proof.pi_a.slice(0, 2),
      pB: [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
      pC: proof.pi_c.slice(0, 2),
    },
  });
}

const elections = (await call('GET', '/elections')).data;
const active = elections.find((e) => e.status === 'active');
const pending = elections.find((e) => e.status === 'pending');
ok(!!active && !!pending, `시드 선거: 진행 중 #${active?.id}, 예정 #${pending?.id}`);

// 명단 밖 학생
const outTok = await login(accounts.outsider.email);
const outElig = await call('GET', `/elections/${active.id}/my-eligibility`, { token: outTok });
ok(outElig.data.eligible === false && outElig.data.reason === 'not_in_voter_list', '명단 밖 학생은 자격 없음');

// 학생 투표 (후보 0,1,2,0,1 → 2/2/1)
const choices = [0, 1, 2, 0, 1];
const secrets = [];
for (let i = 0; i < accounts.students.length; i++) {
  const st = accounts.students[i];
  const token = await login(st.email);
  const el = (await call('GET', `/elections/${active.id}/my-eligibility`, { token })).data;
  ok(el.eligible && el.registered === false, `${st.label}: 자격 있음, 미등록`);
  const seed = bytesToField(newRecoveryBytes());
  const secret = await deriveSecret(seed, active.contract_address);
  secrets.push(secret);
  const reg = await call('POST', `/elections/${active.id}/register-commitment`, { token, body: { commitment: (await computeCommitment(secret)).toString() } });
  ok(reg.status === 200, `${st.label}: 투표 키 등록`);
  const t0 = Date.now();
  const r = await vote(active, secret, choices[i]);
  ok(r.status === 200, `${st.label}: 후보 ${choices[i]} 투표 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// 이중투표
const dup = await vote(active, secrets[0], 2);
ok(dup.status === 400 && String(dup.data.reason || '').includes('duplicate nullifier'), '같은 학생 두 번째 투표 거절 (nullifier)');

// 예정 선거: 미리 등록 → 교체
{
  const token = await login(accounts.students[0].email);
  const e1 = (await call('GET', `/elections/${pending.id}/my-eligibility`, { token })).data;
  ok(e1.eligible && e1.status === 'pending', '예정 선거에도 들어갈 수 있음');
  const s1 = await deriveSecret(bytesToField(newRecoveryBytes()), pending.contract_address);
  ok((await call('POST', `/elections/${pending.id}/register-commitment`, { token, body: { commitment: (await computeCommitment(s1)).toString() } })).status === 200, '예정 선거 미리 등록');
  const e2 = (await call('GET', `/elections/${pending.id}/my-eligibility`, { token })).data;
  ok(e2.can_replace === true, '시작 전이라 교체 가능');
  const s2 = await deriveSecret(bytesToField(newRecoveryBytes()), pending.contract_address);
  const rep = await call('POST', `/elections/${pending.id}/register-commitment`, { token, body: { commitment: (await computeCommitment(s2)).toString(), replace: true } });
  ok(rep.status === 200, `새 투표 키로 교체 ${rep.status === 200 ? '' : JSON.stringify(rep.data)}`);
  const onChain = (await new ethers.Contract(pending.contract_address, abi, provider).getCommitments()).map(String);
  ok(onChain.includes(String(await computeCommitment(s2))) && !onChain.includes(String(await computeCommitment(s1))), '체인 명단에 새 키만 남음');
}

if (process.argv.includes('--tally')) {
  const adminTok = await login(accounts.admin.email);
  const c = await call('POST', `/elections/${active.id}/close`, { token: adminTok });
  ok(c.status === 200, '관리자 종료');
  const t0 = Date.now();
  const t = await call('POST', `/elections/${active.id}/tally`, { token: adminTok });
  ok(t.status === 200, `개표 + 체인 기록 (${((Date.now() - t0) / 1000).toFixed(1)}s) ${t.status === 200 ? '' : JSON.stringify(t.data)}`);
  const res = (await call('GET', `/elections/${active.id}/result`)).data;
  const counts = (res.results || res.candidates || []).map((x) => Number(x.vote_count ?? x.votes ?? 0));
  ok(JSON.stringify(counts.slice(0, 3)) === JSON.stringify([2, 2, 1]), `결과 2/2/1 → ${JSON.stringify(counts)}`);
  const vs = new ethers.Contract(active.contract_address, abi, provider);
  ok(await vs.tallied(), '체인에 개표 증명 기록됨 (tallied)');
}

console.log(failures ? `\n실패 ${failures}건` : '\n전부 통과');
process.exit(failures ? 1 : 0);
