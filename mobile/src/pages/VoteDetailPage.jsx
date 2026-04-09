import { useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CANDIDATES } from "../data/mockData";

export default function VoteDetailPage({ vote, onBack }) {
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showDoneModal, setShowDoneModal] = useState(false);
  const selectedCandidate = CANDIDATES.find(c => c.id === selected);

  const handleConfirm = () => {
    setShowModal(false);
    setShowDoneModal(true);
  };

  const handleDoneConfirm = () => {
    setShowDoneModal(false);
    onBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 네비 */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← 목록으로</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.main} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* 투표 정보 카드 */}
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Text style={styles.infoIconText}>📋</Text>
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>{vote?.title}</Text>
            <Text style={styles.infoDeadline}>투표 마감: 2026-03-27 18:00</Text>
            <Text style={styles.infoDesc}>{vote?.desc}</Text>
          </View>
        </View>

        {/* 경고 배너 */}
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            ⚠️ 투표는 한 번만 가능하며, 제출 후에는 수정할 수 없습니다. 신중하게 선택해주세요.
          </Text>
        </View>

        {/* 후보자 선택 */}
        <Text style={styles.sectionTitle}>후보자 선택</Text>
        {CANDIDATES.map(c => (
          <TouchableOpacity
            key={c.id}
            style={[styles.candidateCard, selected === c.id && styles.candidateCardSelected]}
            onPress={() => setSelected(c.id)}
          >
            <View style={[styles.selectDot, selected === c.id && styles.selectDotVisible]} />
            <View style={[styles.candidateNum, selected === c.id && styles.candidateNumSelected]}>
              <Text style={[styles.candidateNumText, selected === c.id && styles.candidateNumTextSelected]}>
                {c.id}
              </Text>
            </View>
            <View style={styles.candidateInfo}>
              <Text style={styles.candidateName}>{c.name}</Text>
              <Text style={styles.candidateDept}>{c.dept}</Text>
              <Text style={styles.candidateSlogan}>{c.slogan}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 하단 버튼 */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}>
          <Text style={styles.cancelBtnText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.voteBtn, !selected && styles.voteBtnDisabled]}
          onPress={() => selected && setShowModal(true)}
          disabled={!selected}
        >
          <Text style={styles.voteBtnText}>투표하기</Text>
        </TouchableOpacity>
      </View>

      {/* 투표 확인 모달 */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>투표 확인</Text>
            <Text style={styles.modalSubtitle}>선택한 후보로 투표하시겠습니까?</Text>

            <View style={styles.modalCandidateBox}>
              <Text style={styles.modalCandidateName}>{selectedCandidate?.name}</Text>
              <Text style={styles.modalCandidateSlogan}>{selectedCandidate?.slogan}</Text>
            </View>

            <View style={styles.modalWarning}>
              <Text style={styles.modalWarningText}>⚠️ 투표 후에는 변경할 수 없습니다</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.modalCancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleConfirm}>
                <Text style={styles.modalConfirmBtnText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 투표 완료 모달 */}
      <Modal visible={showDoneModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { alignItems: "center" }]}>
            <View style={styles.doneIcon}>
              <Text style={{ fontSize: 32 }}>✓</Text>
            </View>
            <Text style={styles.modalTitle}>투표가 완료되었습니다</Text>
            <Text style={styles.modalSubtitle}>소중한 한 표가 반영되었습니다.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleDoneConfirm}>
                <Text style={styles.modalConfirmBtnText}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },

  /* 네비 */
  navBar: {
    backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#e8e8e8",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  backBtn: {},
  backBtnText: { fontSize: 15, color: "#444" },

  /* 메인 */
  main: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },

  /* 정보 카드 */
  infoCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 20,
    marginBottom: 12, flexDirection: "row", gap: 16,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  infoIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: "#1a5fa8",
    alignItems: "center", justifyContent: "center",
  },
  infoIconText: { fontSize: 22 },
  infoBody: { flex: 1 },
  infoTitle: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 4 },
  infoDeadline: { fontSize: 12, color: "#999", marginBottom: 8 },
  infoDesc: { fontSize: 13, color: "#555", lineHeight: 20 },

  /* 경고 배너 */
  warningBanner: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e8e8e8",
    borderRadius: 12, padding: 14, marginBottom: 24,
  },
  warningText: { fontSize: 13, color: "#555", lineHeight: 20 },

  /* 섹션 타이틀 */
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 14 },

  /* 후보자 카드 */
  candidateCard: {
    backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#e8e8e8",
    borderRadius: 14, padding: 18, marginBottom: 10,
    flexDirection: "row", alignItems: "flex-start", gap: 14,
  },
  candidateCardSelected: { borderColor: "#1a5fa8", backgroundColor: "#f0f6ff" },
  selectDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, opacity: 0 },
  selectDotVisible: { backgroundColor: "#1a5fa8", opacity: 1 },
  candidateNum: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: "#eee",
    alignItems: "center", justifyContent: "center",
  },
  candidateNumSelected: { backgroundColor: "#1a5fa8" },
  candidateNumText: { fontSize: 14, fontWeight: "700", color: "#555" },
  candidateNumTextSelected: { color: "#fff" },
  candidateInfo: { flex: 1 },
  candidateName: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 3 },
  candidateDept: { fontSize: 12, color: "#888", marginBottom: 4 },
  candidateSlogan: { fontSize: 13, color: "#555" },

  /* 하단 버튼 */
  bottomActions: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e8e8e8",
    padding: 16, flexDirection: "row", gap: 12,
  },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#ddd", alignItems: "center",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: "#444" },
  voteBtn: { flex: 1, padding: 15, borderRadius: 10, backgroundColor: "#111", alignItems: "center" },
  voteBtnDisabled: { backgroundColor: "#ccc" },
  voteBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },

  /* 모달 */
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modal: {
    backgroundColor: "#fff", borderRadius: 16, padding: 28,
    width: "100%", maxWidth: 420,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 40, elevation: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: "#888", marginBottom: 18 },
  modalCandidateBox: { backgroundColor: "#f5f7fa", borderRadius: 10, padding: 16, marginBottom: 12 },
  modalCandidateName: { fontSize: 15, fontWeight: "700", color: "#111", marginBottom: 4 },
  modalCandidateSlogan: { fontSize: 13, color: "#666" },
  modalWarning: {
    backgroundColor: "#fff9f0", borderWidth: 1, borderColor: "#fde8c0",
    borderRadius: 10, padding: 12, marginBottom: 20,
  },
  modalWarningText: { fontSize: 13, color: "#b45309" },
  modalActions: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1, padding: 13, borderRadius: 10,
    borderWidth: 1.5, borderColor: "#ddd", alignItems: "center",
  },
  modalCancelBtnText: { fontSize: 14, fontWeight: "600", color: "#444" },
  modalConfirmBtn: { flex: 1, padding: 13, borderRadius: 10, backgroundColor: "#111", alignItems: "center" },
  modalConfirmBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },

  /* 완료 아이콘 */
  doneIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: "#22c55e",
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
});
