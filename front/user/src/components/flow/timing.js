// 흐름도 재생 속도 (칸 하나가 머무는 시간)
export const START_MS = 400;
export const OP_MS = 3500;
export const SEND_MS = 4500; // 데이터 카드가 움직이는 시간(3초)까지 포함

export const durationOf = (beats) => beats.reduce((t, b) => t + (b.send ? SEND_MS : OP_MS), START_MS);
