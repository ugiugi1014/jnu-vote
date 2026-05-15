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
  // TODO: ECDH 복호화 + tally.circom 검증 연결 후 실제 개표 로직으로 교체
  console.log(`[scheduler] election ${electionId} auto tally placeholder`);
}

async function closeAndTallyElection(electionId) {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, status, end_time
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
