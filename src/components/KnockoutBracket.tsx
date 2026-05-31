/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useTournamentStore } from '../store';
import { Trophy, PlayCircle, HelpCircle, AlertTriangle } from 'lucide-react';
import { getReadableTeamName, getReadableKoMatchName } from '../utils/tournamentEngine';

export default function KnockoutBracket() {
  const {
    matches,
    teams,
    groups,
    generateKnockoutBracket,
    clearKnockout,
    updateKnockoutScore,
    updateKnockoutParticipant,
    addLog,
  } = useTournamentStore();

  const [sz, setSz] = useState<4 | 8 | 16 | 32>(4);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  // Lấy danh sách đội thi đấu để làm dropdown chọn đội đi tiếp
  const teamList = Object.values(teams);
  const teamNames = teamList.map((t) => t.name);

  // Lọc chỉ lấy các trận đấu Knockout
  const koMatches = matches.filter((m) => m.groupId === 'knockout');

  // Đếm các trận thi đấu knockout theo vòng
  const roundsMap: Record<number, typeof koMatches> = {};
  koMatches.forEach((m) => {
    if (!roundsMap[m.round]) {
      roundsMap[m.round] = [];
    }
    roundsMap[m.round].push(m);
  });

  const roundsKeys = Object.keys(roundsMap)
    .map(Number)
    .sort((a, b) => a - b);

  const handleGenerateBracket = () => {
    generateKnockoutBracket(sz);
  };

  const handleClearBracketConfirm = () => {
    clearKnockout();
    setShowClearConfirmModal(false);
  };

  // Local state for numeric inputs to avoid lags/cursor jumps and handle incomplete edits gracefully
  const [localScores, setLocalScores] = useState<Record<string, { scoreA: string; scoreB: string }>>({});

  // Sync state whenever matches change
  useEffect(() => {
    setLocalScores((prev) => {
      const nextMap = { ...prev };
      koMatches.forEach((m) => {
        const storeSA = m.scoreA !== null ? String(m.scoreA) : '';
        const storeSB = m.scoreB !== null ? String(m.scoreB) : '';

        // If the store has non-null elements, force sync
        if (m.scoreA !== null || m.scoreB !== null) {
          nextMap[m.id] = { scoreA: storeSA, scoreB: storeSB };
        } else {
          // If store is null/null, we only clear local state if the local state was also matching a non-null match before, 
          // or if we just want to align when they are both empty.
          const localSA = prev[m.id]?.scoreA || '';
          const localSB = prev[m.id]?.scoreB || '';
          if (localSA !== '' && localSB !== '') {
            // It was an external reset!
            nextMap[m.id] = { scoreA: '', scoreB: '' };
          } else {
            // User is actively typing, preserve their local scratchpad
            nextMap[m.id] = {
              scoreA: localSA,
              scoreB: localSB,
            };
          }
        }
      });
      return nextMap;
    });
  }, [matches]);

  const handleScoreInputChange = (matchId: string, team: 'A' | 'B', value: string) => {
    // Keep value clean: only digits or empty string
    const cleanVal = value.replace(/[^0-9]/g, '');

    const currentMatchLocal = localScores[matchId] || { scoreA: '', scoreB: '' };
    const updatedMatch = {
      ...currentMatchLocal,
      [team === 'A' ? 'scoreA' : 'scoreB']: cleanVal,
    };

    // Update local scratchpad state instantly
    setLocalScores((prev) => ({
      ...prev,
      [matchId]: updatedMatch,
    }));

    const scoreAStr = updatedMatch.scoreA;
    const scoreBStr = updatedMatch.scoreB;

    // Realtime auto-save & auto-calculate knockout winner / deuces
    if (scoreAStr !== '' && scoreBStr !== '') {
      const numA = Number(scoreAStr);
      const numB = Number(scoreBStr);

      if (numA !== numB) {
        updateKnockoutScore(matchId, numA, numB);
      } else {
        // Reset progression when scores are equalized
        updateKnockoutScore(matchId, null, null);
      }
    } else {
      // If either score is cleared, reset match score to pending
      const currentMatchInStore = matches.find((m) => m.id === matchId);
      if (
        currentMatchInStore &&
        (currentMatchInStore.scoreA !== null || currentMatchInStore.scoreB !== null)
      ) {
        updateKnockoutScore(matchId, null, null);
      }
    }
  };

  return (
    <div className="space-y-8" id="knockout-bracket-view">
      
      {/* Thẻ điều khiển lập nhánh (To Rõ, Đầy Đủ Chức Năng) */}
      <div className="bg-white dark:bg-zinc-900 p-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-md">
        <div className="space-y-1">
          <h3 className="text-xl font-extrabold text-[#111c30] dark:text-zinc-100 flex items-center gap-2 uppercase tracking-tight">
            <Trophy size={22} className="text-amber-500 stroke-[2.5]" />
            Sơ Đồ Nhánh Knockout Loại Trực Tiếp
          </h3>
          <p className="text-xs text-zinc-400 font-semibold">
            Tình huống khi đổi điểm số sẽ tự động đồng bộ đẩy đội thắng vào vòng tiếp theo.
          </p>
        </div>

        {koMatches.length === 0 ? (
          <div className="flex items-center gap-4 shrink-0">
            <select
              value={sz}
              onChange={(e) => setSz(Number(e.target.value) as 4 | 8 | 16 | 32)}
              className="px-4 py-2.5 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-black text-zinc-800 dark:text-zinc-100 bg-zinc-55 dark:bg-zinc-950 cursor-pointer"
            >
              <option value={4}>Nhánh 4 đội (Bán Kết - 2 bảng)</option>
              <option value={8}>Nhánh 8 đội (Tứ Kết)</option>
              <option value={16}>Nhánh 16 đội (Vòng 1/8)</option>
              <option value={32}>Nhánh 32 đội (Vòng 1/16)</option>
            </select>
            <button
              onClick={handleGenerateBracket}
              className="px-5 py-3 hover:bg-blue-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 bg-blue-600 text-white font-black rounded-xl text-xs transition-all flex items-center gap-2 shadow-md uppercase tracking-wider cursor-pointer"
              id="btn-generate-knockout"
            >
              <PlayCircle size={16} /> Khởi tạo sơ đồ nhánh
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirmModal(true)}
            className="px-5 py-3 text-xs font-black bg-red-50 hover:bg-red-100 dark:bg-red-955/40 text-red-650 dark:text-red-400 rounded-xl cursor-pointer border border-red-250 transition-colors uppercase tracking-wider shadow-xs"
            id="btn-delete-knockout"
          >
            Hủy & Tạo Lại Sơ Đồ
          </button>
        )}
      </div>

      {koMatches.length === 0 ? (
        <div className="py-24 text-center text-zinc-400 bg-white dark:bg-zinc-900 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-4 shadow-inner">
          <Trophy size={54} className="mx-auto text-zinc-300 dark:text-zinc-700 animate-bounce" />
          <p className="font-extrabold text-zinc-700 dark:text-zinc-300 text-lg">Sơ đồ đấu loại trực tiếp (Cúp vàng) chưa được lập.</p>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto font-semibold">Nhấn nút "Khởi tạo sơ đồ nhánh" ở trên để hệ thống tự động bốc thăm xếp lịch đấu loại trực tiếp.</p>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* Hướng Dẫn Tải Đầy Đủ */}
          <div className="p-4 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-250 text-[#111c30] dark:text-blue-300 rounded-xl flex items-start gap-3">
            <HelpCircle size={18} className="shrink-0 mt-0.5 text-blue-500" />
            <div className="text-xs leading-relaxed font-semibold">
              <span className="font-black text-sm uppercase text-blue-850 dark:text-blue-400 block mb-1">MẸO QUẢN LÝ / CHỌN ĐỘI TIẾN VÀO:</span>
              Tại Cột Vòng Khởi Đầu (Tứ kết hoặc 1/8), bạn có thể nhấp chọn trực tiếp từ <strong className="underline text-blue-600 dark:text-blue-450">Dropdown menu</strong> của từng trận đấu để chỉ định đích danh đội đi tiếp một cách thủ công, không bị bó buộc bởi kết quả tự động! Điểm số trực tiếp sẽ cập nhật nhánh ngay lập tức.
            </div>
          </div>

          {/* Bracket Tree Layout bằng CSS Flexbox Columns nối tiếp */}
          <div className="overflow-x-auto select-none py-10 bg-white dark:bg-zinc-900 rounded-3xl border border-solid border-zinc-200 dark:border-zinc-805 shadow-md" style={{ borderStyle: 'solid' }} id="bracket-scroller">
            <div className="flex gap-14 min-w-[950px] justify-between items-center px-8 relative" style={{ paddingLeft: '32px', paddingTop: '0px', marginTop: '-30px' }}>
              {roundsKeys.map((roundIdx) => {
                const roundMatches = roundsMap[roundIdx];
                const roundName = roundMatches[0]?.knockoutRoundName || `Vòng đấu ${roundIdx}`;

                return (
                  <div
                    key={roundIdx}
                    className="flex-1 flex flex-col gap-14"
                    id={`bracket-column-round-${roundIdx}`}
                    style={roundIdx === 1 ? {
                      height: '693.333px',
                      paddingLeft: '0px',
                      paddingRight: '0px',
                      marginLeft: '0px',
                      marginTop: '0px',
                      width: '630px'
                    } : undefined}
                  >
                    {/* Tên vòng đấu cột bự và sáng láng */}
                    <div className="text-center font-black text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-955/40 py-2.5 px-3 rounded-xl uppercase tracking-widest border border-blue-105 dark:border-blue-900/30">
                      {roundName}
                    </div>

                    {/* Danh sách trận đấu dọc */}
                    <div className="flex flex-col justify-around gap-6 h-[600px] relative">
                      {roundMatches.map((m) => {
                        const isFinished = m.status === 'finished';
                        
                        return (
                          <div
                            key={m.id}
                            className={`p-4.5 rounded-2xl border text-sm shadow-md transition-all duration-200 bg-zinc-50 dark:bg-zinc-950 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent w-76 md:w-88 ${
                              isFinished
                                ? 'border-zinc-250 dark:border-zinc-800'
                                : 'border-zinc-200 dark:border-zinc-805'
                            }`}
                            id={`bracket-match-node-${m.id}`}
                            style={m.id === 'ko-QF1-ww7imxn' ? {
                              paddingLeft: '3px',
                              paddingTop: '3px',
                              paddingRight: '3px',
                              paddingBottom: '3px'
                            } : undefined}
                          >
                            <div 
                              className="flex items-center justify-between text-[10px] text-zinc-400 font-extrabold mb-3 pb-2 border-b border-zinc-200/55 dark:border-zinc-850/60 uppercase"
                              style={m.id === 'ko-QF2-3f2hlbu' ? { marginBottom: '0px' } : undefined}
                            >
                              <span style={{ fontSize: '14px', color: '#dd13c8' }}>{getReadableKoMatchName(m.knockoutMatchId || '')}</span>
                              {isFinished && <span className="text-emerald-600 dark:text-emerald-400 font-bold">HOÀN TẤT</span>}
                            </div>

                            <div className="space-y-4">
                              {/* Hàng Đội A (Hạt giống / Cho phép lựa chọn qua dropdown select) */}
                              <div className="flex items-center justify-between gap-3" style={(m.id === 'ko-QF1-ww7imxn' || m.id === 'ko-QF2-3f2hlbu') ? { marginBottom: '0px' } : undefined}>
                                <div className="flex items-center gap-1.5 truncate max-w-[210px] sm:max-w-[250px]">
                                  {!isFinished && m.round === 1 ? (
                                    <select
                                      value={m.teamAId}
                                      onChange={(e) => updateKnockoutParticipant(m.id, 'A', e.target.value)}
                                      className="px-2 py-1.5 font-black rounded-lg border border-zinc-250 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-1 focus:ring-blue-500 max-w-[190px] sm:max-w-[230px] cursor-pointer"
                                      style={m.id === 'ko-QF1-ww7imxn' ? { width: '300px', maxWidth: 'none' } : undefined}
                                    >
                                      {/* Thêm option placeholder nếu chưa nằm trong list đội giải */}
                                      {!teamNames.includes(m.teamAId) && (
                                        <option value={m.teamAId}>{getReadableTeamName(m.teamAId)}</option>
                                      )}
                                      {teamList.map((t) => (
                                        <option key={t.id} value={t.name}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span 
                                      className={`font-black text-xs sm:text-sm truncate block max-w-[190px] sm:max-w-[230px] ${
                                        isFinished && m.winnerId === m.teamAId 
                                          ? 'text-blue-600 dark:text-blue-400 underline decoration-2' 
                                          : 'text-zinc-800 dark:text-zinc-200'
                                      }`}
                                      title={getReadableTeamName(m.teamAId)}
                                    >
                                      {getReadableTeamName(m.teamAId)}
                                    </span>
                                  )}
                                </div>
                                
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  placeholder=""
                                  value={localScores[m.id]?.scoreA ?? ''}
                                  onChange={(e) => handleScoreInputChange(m.id, 'A', e.target.value)}
                                  className="w-12 h-9 border border-zinc-250 dark:border-zinc-800 rounded-xl text-center font-bold text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
                                  id={`input-ko-match-${m.id}-scoreA`}
                                />
                              </div>

                              {/* Hàng Đội B */}
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5 truncate max-w-[210px] sm:max-w-[250px]">
                                  {!isFinished && m.round === 1 ? (
                                    <select
                                      value={m.teamBId}
                                      onChange={(e) => updateKnockoutParticipant(m.id, 'B', e.target.value)}
                                      className="px-2 py-1.5 font-black rounded-lg border border-zinc-250 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-1 focus:ring-blue-500 max-w-[190px] sm:max-w-[230px] cursor-pointer"
                                      style={m.id === 'ko-QF1-ww7imxn' ? { width: '300px', maxWidth: 'none' } : undefined}
                                    >
                                      {!teamNames.includes(m.teamBId) && (
                                        <option value={m.teamBId}>{getReadableTeamName(m.teamBId)}</option>
                                      )}
                                      {teamList.map((t) => (
                                        <option key={t.id} value={t.name}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span 
                                      className={`font-black text-xs sm:text-sm truncate block max-w-[190px] sm:max-w-[230px] ${
                                        isFinished && m.winnerId === m.teamBId 
                                          ? 'text-blue-600 dark:text-blue-400 underline decoration-2' 
                                          : 'text-zinc-800 dark:text-zinc-200'
                                      }`}
                                      title={getReadableTeamName(m.teamBId)}
                                    >
                                      {getReadableTeamName(m.teamBId)}
                                    </span>
                                  )}
                                </div>

                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  placeholder=""
                                  value={localScores[m.id]?.scoreB ?? ''}
                                  onChange={(e) => handleScoreInputChange(m.id, 'B', e.target.value)}
                                  className="w-12 h-9 border border-zinc-250 dark:border-zinc-800 rounded-xl text-center font-bold text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
                                  id={`input-ko-match-${m.id}-scoreB`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* POPUP XÁC NHẬN HỦY SƠ ĐỒ LOẠI TRỰC TIẾP TRONG iFRAME AN TOÀN TUYỆT ĐỐI */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-51 animate-fade-in" id="clear-bracket-popup">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6.5 shadow-2xl space-y-4">
            
            <div className="flex items-center gap-3.5 text-red-650">
              <div className="p-3 bg-red-50 dark:bg-red-955/40 rounded-2xl">
                <AlertTriangle size={24} className="stroke-[2.5] text-red-550" />
              </div>
              <div>
                <h4 className="text-lg font-black leading-tight text-zinc-900 dark:text-zinc-100">Yêu Cầu Hủy Sơ Đồ Nhánh</h4>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Hành động nhạy cảm nguy hiểm</p>
              </div>
            </div>

            <p className="text-sm font-semibold text-zinc-650 dark:text-zinc-400 leading-relaxed pt-2">
              <strong>CẢNH BÁO:</strong> Thao tác này sẽ <strong className="text-red-600 dark:text-red-400 font-black underline uppercase">XÓA BỎ VĨNH VIỄN</strong> toàn bộ sơ đồ phân nhánh và lịch đấu loại trực tiếp đang diễn ra (bao gồm các trận đã thi đấu có kết quả). 
              Bạn có thực sự chắc chắn muốn thực hiện lại quy trình bốc thăm không?
            </p>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="px-5 py-2.5 text-xs font-bold text-zinc-600 hover:text-zinc-700 bg-zinc-105 hover:bg-zinc-200 dark:bg-zinc-805 dark:text-zinc-300 rounded-xl cursor-pointer"
              >
                Hủy bỏ
              </button>
              
              <button
                onClick={handleClearBracketConfirm}
                className="px-6 py-2.5 text-xs font-bold text-white bg-red-650 hover:bg-red-600 rounded-xl shadow-md cursor-pointer uppercase tracking-wider"
                id="btn-confirm-clear-bracket"
              >
                Xóa sơ đồ nhánh cũ
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
