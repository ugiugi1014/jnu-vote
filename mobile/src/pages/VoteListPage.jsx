import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TABS, VOTES } from "../data/mockData";

/* ── 인증 상태 표시 ── */
function AuthStatus({ status, onGoUpload }) {
  if (status === "approved") {
    return <Text style={styles.authApproved}>🟢 인증완료</Text>;
  }
  if (status === "pending") {
    return <Text style={styles.authPending}>🟡 검토중</Text>;
  }
  return (
    <View style={styles.authRow}>
      <Text style={styles.authNone}>🔴 미인증</Text>
      <TouchableOpacity style={styles.authBtn} onPress={onGoUpload}>
        <Text style={styles.authBtnText}>인증하기</Text>
      </TouchableOpacity>
    </View>
  );
}

const STATUS_BADGE = {
  active: { bg: "#dcfce7", color: "#16a34a", label: "진행중" },
  upcoming: { bg: "#dbeafe", color: "#1d4ed8", label: "예정" },
  ended: { bg: "#f3f4f6", color: "#6b7280", label: "종료" },
};

export default function VoteListPage({
  studentId, onLogout, onVote, onResult, userStatus, onGoUpload,
}) {
  const [activeTab, setActiveTab] = useState("active");
  const votes = VOTES[activeTab] || [];
  const isApproved = userStatus === "approved";

  const handleVoteClick = (vote) => {
    if (!isApproved) { onGoUpload(); return; }
    onVote(vote);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>제주대학교 전자투표</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutBtnText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerBottom}>
          <Text style={styles.studentId}>👤 {studentId}</Text>
          <AuthStatus status={userStatus} onGoUpload={onGoUpload} />
        </View>
      </View>

      <ScrollView style={styles.main}>
        <Text style={styles.pageTitle}>투표 목록</Text>
        <Text style={styles.pageDesc}>진행중인 투표에 참여하거나 결과를 확인하세요</Text>

        {/* 탭 */}
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label} ({tab.count})
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 투표 카드 */}
        {votes.length === 0
          ? <Text style={styles.empty}>해당 투표가 없습니다.</Text>
          : votes.map(vote => {
            const badge = STATUS_BADGE[vote.status];
            return (
              <View style={styles.voteCard} key={vote.id}>
                <View style={styles.voteCardTop}>
                  <View style={styles.badgeOutline}>
                    <Text style={styles.badgeOutlineText}>{vote.category}</Text>
                  </View>
                  {badge && (
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  )}
                  {vote.voted && (
                    <View style={styles.badgeOutline}>
                      <Text style={styles.badgeOutlineText}>투표 완료</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.voteTitle}>{vote.title}</Text>
                <Text style={styles.voteDesc}>{vote.desc}</Text>

                <View style={styles.voteCardBottom}>
                  <Text style={styles.metaText}>📅 {vote.period}</Text>
                  {vote.voters && <Text style={styles.metaText}>👥 투표자 {vote.voters}</Text>}

                  {vote.status === "active" && !vote.voted && (
                    <View style={styles.voteActionWrap}>
                      <TouchableOpacity
                        style={[styles.voteBtn, !isApproved && styles.voteBtnDisabled]}
                        onPress={() => handleVoteClick(vote)}
                      >
                        <Text style={[styles.voteBtnText, !isApproved && styles.voteBtnTextDisabled]}>
                          투표하기
                        </Text>
                      </TouchableOpacity>
                      {!isApproved && (
                        <Text style={styles.voteHint}>
                          {userStatus === "pending" ? "학생증 검토 중입니다" : "학생증 인증이 필요합니다"}
                        </Text>
                      )}
                    </View>
                  )}
                  {vote.status === "ended" && (
                    <TouchableOpacity style={styles.resultBtn} onPress={() => onResult(vote)}>
                      <Text style={styles.resultBtnText}>결과 보기</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        }
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },

  /* 헤더 */
  header: {
    backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#e8e8e8",
  },
  headerTop: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 6,
  },
  headerBottom: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  studentId: { fontSize: 12, color: "#555" },
  logoutBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5, borderColor: "#e0e0e0", borderRadius: 8,
  },
  logoutBtnText: { fontSize: 12, color: "#444" },

  /* 인증 상태 */
  authApproved: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  authPending: { fontSize: 12, fontWeight: "600", color: "#a16207" },
  authNone: { fontSize: 12, fontWeight: "600", color: "#dc2626" },
  authRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  authBtn: {
    backgroundColor: "#1a5fa8", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  authBtnText: { fontSize: 11, fontWeight: "600", color: "#fff" },

  /* 메인 */
  main: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  pageTitle: { fontSize: 24, fontWeight: "700", color: "#111", marginBottom: 6 },
  pageDesc: { fontSize: 14, color: "#888", marginBottom: 24 },

  /* 탭 */
  tabBar: {
    flexDirection: "row", backgroundColor: "#eee",
    borderRadius: 12, padding: 4, marginBottom: 20,
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 9 },
  tabItemActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: "500", color: "#888" },
  tabTextActive: { fontWeight: "600", color: "#111" },

  /* 투표 카드 */
  voteCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 20,
    marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.06,
    shadowRadius: 6, elevation: 2,
  },
  voteCardTop: { flexDirection: "row", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: "500" },
  badgeOutline: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    borderWidth: 1.5, borderColor: "#ddd",
  },
  badgeOutlineText: { fontSize: 12, color: "#666" },
  voteTitle: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 6 },
  voteDesc: { fontSize: 13, color: "#888", marginBottom: 14, lineHeight: 20 },
  voteCardBottom: { gap: 6 },
  metaText: { fontSize: 12, color: "#999" },

  /* 투표하기 버튼 */
  voteActionWrap: { alignItems: "flex-end", gap: 4 },
  voteBtn: {
    backgroundColor: "#111", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
  },
  voteBtnDisabled: {
    backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#e0e0e0",
  },
  voteBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  voteBtnTextDisabled: { color: "#bbb" },
  voteHint: { fontSize: 11, color: "#aaa" },

  /* 결과 보기 버튼 */
  resultBtn: {
    alignSelf: "flex-end", paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5, borderColor: "#ddd",
  },
  resultBtnText: { fontSize: 14, fontWeight: "600", color: "#444" },

  empty: { textAlign: "center", color: "#bbb", fontSize: 14, marginTop: 60 },
});
