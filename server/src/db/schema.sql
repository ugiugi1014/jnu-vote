-- JNU 블록체인 전자투표 시스템 DB 스키마

CREATE DATABASE IF NOT EXISTS jnu_vote
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE jnu_vote;

-- 선거
CREATE TABLE elections (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  title             VARCHAR(200)  NOT NULL,
  description       TEXT,
  start_time        DATETIME      NOT NULL,
  end_time          DATETIME      NOT NULL,
  status            ENUM('pending', 'active', 'closed', 'tallied') DEFAULT 'pending',
  coord_public_key  TEXT,                  -- ECDH 코디네이터 공개키 (유권자에게 공개)
  coord_private_key TEXT,                  -- ECDH 코디네이터 개인키 (개표 시 복호화용)
  contract_address  VARCHAR(42),           -- 배포된 VotingSystem 컨트랙트 주소
  total_voters      INT           DEFAULT 0,
  voted_count       INT           DEFAULT 0,
  created_at        DATETIME      DEFAULT CURRENT_TIMESTAMP
);

-- 후보자
CREATE TABLE candidates (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  election_id      INT          NOT NULL,
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  candidate_index  INT          NOT NULL,  -- 컨트랙트에서 사용하는 인덱스 (1, 2, 3...)
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
  UNIQUE KEY uq_candidate (election_id, candidate_index)
);

-- 유권자 (투표 시 동적 생성)
CREATE TABLE voters (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  election_id      INT          NOT NULL,
  email            VARCHAR(100) NOT NULL,  -- @stu.jejunu.ac.kr
  wallet_address   VARCHAR(42),            -- 인앱 지갑 주소 (인증 완료 후 저장)
  voter_public_key TEXT,                   -- ECDH 공개키 (투표 제출 시 저장, 개표에 사용)
  has_voted        BOOLEAN      DEFAULT FALSE,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE,
  UNIQUE KEY uq_voter (election_id, email)
);

-- 이메일 인증 코드
CREATE TABLE auth_codes (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  email       VARCHAR(100) NOT NULL,
  code        VARCHAR(10)  NOT NULL,
  expires_at  DATETIME     NOT NULL,  -- 발송 후 5분
  is_used     BOOLEAN      DEFAULT FALSE,
  attempts    INT          DEFAULT 0, -- 틀린 횟수 (5회 초과 시 잠금)
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- 유저별 서버 시크릿 (인앱 지갑 재생성용)
-- 지갑 개인키 = KDF(웹메일 + server_secret)
CREATE TABLE user_secrets (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  email       VARCHAR(100) UNIQUE NOT NULL,
  secret      VARCHAR(64)  NOT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- 개표 결과 (블록체인 캐시)
CREATE TABLE tally_results (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  election_id  INT NOT NULL,
  candidate_id INT NOT NULL,
  vote_count   INT NOT NULL DEFAULT 0,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (election_id)  REFERENCES elections(id)  ON DELETE CASCADE,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);
