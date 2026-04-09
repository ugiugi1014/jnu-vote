import { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RESULTS } from "../data/mockData";

export default function VoteResultPage({ vote, onBack }) {
  const [animated, setAnimated] = useState(false);
  const progressAnims = RESULTS.map(() => useState(new Animated.Value(0))[0]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimated(true);
      RESULTS.forEach((r, i) => {
        Animated.timing(progressAnims[i], {
          toValue: r.pct / 100,
          duration: 1200,
          useNativeDriver: false,
        }).start();
      });
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* 네비 */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backBtnText}>← 목록으로</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.main}>
        {/* 안건 정보 */}
        <View style={styles.infoCard}>
          <View style={styles.endedBadge}>
            <Text style={styles.endedBadgeText}>종료</Text>
          </View>
          <Text style={styles.infoTitle}>{vote?.title}</Text>
          <Text style={styles.infoDesc}>{vote?.desc}</Text>
        </View>

        {/* 통계 3개 */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>👥</Text>
            <Text style={styles.statValue}>2,150</Text>
            <Text style={styles.statLabel}>총 투표수</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>✅</Text>
            <Text style={[styles.statValue, { color: "#16a34a" }]}>61.4%</Text>
            <Text style={styles.statLabel}>투표율</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>👤</Text>
            <Text style={styles.statValue}>3,500</Text>
            <Text style={styles.statLabel}>전체 유권자</Text>
          </View>
        </View>

        {/* 개표 결과 */}
        <Text style={styles.sectionTitle}>개표 결과</Text>
        {RESULTS.map((r, i) => (
          <View key={r.rank} style={[styles.resultCard, r.elected && styles.resultCardWinner]}>
            <View style={styles.rankWrap}>
              {r.elected && (
                <View style={styles.trophyIcon}>
                  <Text style={styles.trophyText}>🏆</Text>
                </View>
              )}
              <View style={styles.rankCircle}>
                <Text style={styles.rankText}>{r.rank}</Text>
              </View>
            </View>

            <View style={styles.resultBody}>
              <View style={styles.resultNameRow}>
                <Text style={styles.resultName}>{r.name}</Text>
                {r.elected && (
                  <View style={styles.electedBadge}>
                    <Text style={styles.electedBadgeText}>당선</Text>
                  </View>
                )}
              </View>
              <Text style={styles.resultVotes}>{r.votes.toLocaleString()}표</Text>

              {/* 프로그레스 바 */}
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressBar,
                    { width: progressAnims[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    })},
                  ]}
                />
              </View>
            </View>

            <Text style={styles.resultPct}>{r.pct}%</Text>
          </View>
        ))}

        {/* 푸터 */}
        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>* 본 결과는 최종 집계된 결과입니다</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },

  /* 네비 */
  navBar: {
    backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#e8e8e8",
  },
  backBtnText: { fontSize: 15, color: "#444" },

  /* 메인 */
  main: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  /* 안건 정보 */
  infoCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 20,
    marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  endedBadge: {
    backgroundColor: "#f3f4f6", borderRadius: 20, paddingHorizontal: 10,
    paddingVertical: 3, alignSelf: "flex-start", marginBottom: 8,
  },
  endedBadgeText: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  infoTitle: { fontSize: 18, fontWeight: "700", color: "#111", marginBottom: 4 },
  infoDesc: { fontSize: 13, color: "#888" },

  /* 통계 */
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14,
    alignItems: "center", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statIcon: { fontSize: 20, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: "700", color: "#111", marginBottom: 3 },
  statLabel: { fontSize: 11, color: "#999" },

  /* 섹션 타이틀 */
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 14 },

  /* 결과 카드 */
  resultCard: {
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#e8e8e8",
    borderRadius: 14, padding: 18, marginBottom: 10,
    flexDirection: "row", alignItems: "center", gap: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  resultCardWinner: { borderColor: "#f59e0b", backgroundColor: "#fffdf0" },

  rankWrap: { alignItems: "center", justifyContent: "center", width: 44 },
  trophyIcon: { position: "absolute", top: -10, left: -8, zIndex: 1 },
  trophyText: { fontSize: 16 },
  rankCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#eee",
    alignItems: "center", justifyContent: "center",
  },
  rankText: { fontSize: 15, fontWeight: "700", color: "#666" },

  resultBody: { flex: 1 },
  resultNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  resultName: { fontSize: 15, fontWeight: "700", color: "#111" },
  electedBadge: { backgroundColor: "#dbeafe", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  electedBadgeText: { fontSize: 11, fontWeight: "600", color: "#1d4ed8" },
  resultVotes: { fontSize: 12, color: "#999", marginBottom: 8 },

  progressTrack: {
    width: "100%", height: 8, backgroundColor: "#eee", borderRadius: 99, overflow: "hidden",
  },
  progressBar: { height: "100%", backgroundColor: "#111", borderRadius: 99 },

  resultPct: { fontSize: 13, fontWeight: "700", color: "#1a5fa8", minWidth: 42, textAlign: "right" },

  /* 푸터 */
  footerNote: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, marginTop: 8, alignItems: "center",
  },
  footerNoteText: { fontSize: 12, color: "#bbb" },
});
