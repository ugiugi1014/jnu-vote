export const TABS = [
  { key: "active", label: "진행중", count: 3 },
  { key: "upcoming", label: "예정", count: 1 },
  { key: "ended", label: "종료", count: 1 },
];

export const VOTES = {
  active: [
    { id: 1, category: "학생회", status: "active", voted: false,
      title: "2026년 1학기 총학생회 회장 선거",
      desc: "제주대학교 총학생회 회장 및 부회장 선출 투표입니다.",
      period: "2026-03-20 ~ 2026-03-27" },
    { id: 2, category: "단과대", status: "active", voted: true,
      title: "공과대학 학생회 임원 선출",
      desc: "공과대학 학생회 임원진을 선출합니다.",
      period: "2026-03-18 ~ 2026-03-25" },
    { id: 3, category: "학과", status: "active", voted: false,
      title: "컴퓨터공학과 학생대표 선출",
      desc: "컴퓨터공학과 2026년도 학생대표를 선출합니다.",
      period: "2026-03-22 ~ 2026-03-28" },
  ],
  upcoming: [
    { id: 4, category: "총학생회", status: "upcoming", voted: false,
      title: "2026년 2학기 장학금 배분 투표",
      desc: "2학기 자체 장학금 배분 방식을 결정합니다.",
      period: "2026-08-01 ~ 2026-08-07" },
  ],
  ended: [
    { id: 5, category: "축제", status: "ended", voted: true,
      title: "2025년 2학기 축제 기획안 투표",
      desc: "가을 축제 기획안 선정 투표",
      period: "2025-09-01 ~ 2025-09-07", voters: "2,150명" },
  ],
};

export const CANDIDATES = [
  { id: 1, name: "김제주", dept: "경영학과 3학년", slogan: "학생이 중심이 되는 대학" },
  { id: 2, name: "이한라", dept: "컴퓨터공학과 4학년", slogan: "소통하는 총학생회" },
  { id: 3, name: "박성산", dept: "행정학과 3학년", slogan: "변화와 혁신의 시작" },
];

export const RESULTS = [
  { rank: 1, name: "K-POP 페스티벌", votes: 892, pct: 41.5, elected: true },
  { rank: 2, name: "전통 문화 축제", votes: 734, pct: 34.1, elected: false },
  { rank: 3, name: "EDM 콘서트", votes: 524, pct: 24.4, elected: false },
];
