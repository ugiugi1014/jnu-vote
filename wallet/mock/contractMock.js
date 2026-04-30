// 실제 컨트랙트 배포 전 mock
export const contractMock = {
  async castVote(nullifier, proof, ciphertext) {
    console.log('[Contract] castVote 호출');
    console.log('  nullifier:', nullifier);
    console.log('  proof:', proof);
    console.log('  ciphertext:', ciphertext);
    return {
      hash: '0xMOCK_TX_HASH',
      wait: async () => console.log('[Contract] 트랜잭션 완료 (mock)'),
    };
  },
};
