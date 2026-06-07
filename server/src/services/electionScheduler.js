const db = require("../db");

const timers = new Map();
const MAX_TIMEOUT_MS = 2_147_483_647;

function clearElectionSchedule(electionId) {
  const timer = timers.get(Number(electionId));
  if (timer) {
    clearTimeout(timer);
    timers.delete(Number(electionId));
  }
}

async function runAutoTally(electionId) {
  // 순환 require 방지를 위해 함수 안에서 import
  const { performTally } = require("./tallyService");

  console.log(`[scheduler] election ${electionId} auto tally 시작`);

  try {
    const result = await performTally(electionId);

    if (result.recordTallyError) {
      console.warn(
        `[scheduler] election ${electionId} 자동 개표: DB는 tallied 됐으나 체인 기록 실패 — 관리자 수동 재시도 필요. (${result.recordTallyError})`
      );
    } else {
      console.log(
        `[scheduler] election ${electionId} 자동 개표 완료 (tx=${result.tallyTxHash})`
      );
    }
  } catch (err) {
    // 사전 조건 미달 (contract_address 없음, 투표 데이터 없음 등) 은 정상 케이스로 간주
    if (err.statusCode === 400 || err.statusCode === 404) {
      console.log(
        `[scheduler] election ${electionId} 자동 개표 스킵: ${err.message}`
      );
    } else {
      console.error(
        `[scheduler] election ${electionId} 자동 개표 실패:`,
        err.message
      );
    }
  }
}

async function closeAndTallyElection(electionId) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, status, end_time, contract_address
       FROM elections
       WHERE id = ?
       FOR UPDATE`,
      [electionId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      clearElectionSchedule(electionId);
      return;
    }

    const election = rows[0];

    if (election.status === "tallied" || election.status === "closed") {
      await conn.rollback();
      clearElectionSchedule(electionId);
      return;
    }

    if (new Date(election.end_time).getTime() > Date.now()) {
      await conn.rollback();
      scheduleElectionClose(election);
      return;
    }

    await conn.query(
      `UPDATE elections
       SET status = 'closed'
       WHERE id = ? AND status IN ('pending', 'active')`,
      [electionId]
    );

    await conn.commit();
    clearElectionSchedule(electionId);

    // 체인 closeElection() 선행 — 안 하면 runAutoTally의 recordTally가 whenElectionClosed로 revert
    try {
      const { closeElectionOnChain } = require("../blockchain/votingContract");
      await closeElectionOnChain(election.contract_address);
    } catch (err) {
      console.error(`[scheduler] election ${electionId} 체인 closeElection 실패:`, err.message);
    }

    await runAutoTally(electionId);
  } catch (err) {
    await conn.rollback();
    console.error(`[scheduler] election ${electionId} close/tally failed:`, err);
  } finally {
    conn.release();
  }
}

function scheduleElectionClose(election) {
  if (!election || !election.id || !election.end_time) return;

  const electionId = Number(election.id);
  clearElectionSchedule(electionId);

  const delay = new Date(election.end_time).getTime() - Date.now();

  if (delay <= 0) {
    setImmediate(() => closeAndTallyElection(electionId));
    return;
  }

  const timeoutDelay = Math.min(delay, MAX_TIMEOUT_MS);
  const timer = setTimeout(() => {
    if (delay > MAX_TIMEOUT_MS) {
      scheduleElectionClose(election);
    } else {
      closeAndTallyElection(electionId);
    }
  }, timeoutDelay);

  timers.set(electionId, timer);
}

async function restoreElectionSchedules() {
  const [rows] = await db.query(
    `SELECT id, end_time
     FROM elections
     WHERE status IN ('pending', 'active')`
  );

  for (const row of rows) {
    scheduleElectionClose(row);
  }

  console.log(`[scheduler] restored ${rows.length} election schedule(s)`);
}

module.exports = {
  scheduleElectionClose,
  clearElectionSchedule,
  restoreElectionSchedules,
  closeAndTallyElection,
};
