/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { useTournamentStore } from '../store';
import { calculateGroupStandings, getReadableTeamName, getReadableKoMatchName, balanceMatchesRestTime } from '../utils/tournamentEngine';
import { 
  Monitor, 
  Play, 
  Pause, 
  Maximize, 
  Clock, 
  Award, 
  Trophy, 
  Layers, 
  GitCommit, 
  Grid,
  FileSpreadsheet,
  Printer
} from 'lucide-react';

export default function LiveDashboard() {
  const {
    teams,
    groups,
    matches,
    tournament,
    events,
    addLog,
  } = useTournamentStore();

  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('all');
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // local activeCycleTab when focusing on a single event
  const [activeCycleTab, setActiveCycleTab] = useState<'standings' | 'matches' | 'bracket'>('standings');

  // Đếm giờ địa phương ticking liên tục
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTime(
        d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Vòng quay tự động chuyển tab khi xem chi tiết 1 event
  useEffect(() => {
    if (!isPlaying || selectedEventFilter === 'all') return;

    const rotater = setInterval(() => {
      setActiveCycleTab((current) => {
        if (current === 'standings') return 'matches';
        if (current === 'matches') return 'bracket';
        return 'standings';
      });
    }, 5000);

    return () => clearInterval(rotater);
  }, [isPlaying, selectedEventFilter]);

  // Handle Fullscreen API
  const handleToggleFullscreen = () => {
    const el = document.getElementById('live-root-container');
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleExportLiveExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();

      // Quyết định danh sách events cần xuất
      let eventsToExport: any[] = [];
      if (selectedEventFilter === 'all') {
        eventsToExport = Object.values(events || {});
      } else {
        const singleEvent = events[selectedEventFilter];
        if (singleEvent) {
          eventsToExport = [singleEvent];
        }
      }

      if (eventsToExport.length === 0) {
        return;
      }

      eventsToExport.forEach((evt: any) => {
        // Tên sheet Excel tối đa 30 ký tự, lược bỏ ký tự đặc biệt \/?:*[]
        const rawSheetName = evt.name || 'Noi_dung';
        const cleanSheetName = rawSheetName.replace(/[\\\/\?\*\[\]\:]/g, '');
        const sheetName = cleanSheetName.substring(0, 30) || `Nội dung ${evt.id}`;
        
        const worksheet = workbook.addWorksheet(sheetName);

        // Hiển thị đường lưới trong Excel
        worksheet.views = [{ showGridLines: true }];

        // Cố định kích thước các cột dữ liệu chính
        worksheet.columns = [
          { key: 'colA', width: 10 },
          { key: 'colB', width: 22 },
          { key: 'colC', width: 35 },
          { key: 'colD', width: 15 },
          { key: 'colE', width: 35 },
          { key: 'colF', width: 20 },
          { key: 'colG', width: 15 }
        ];

        // 1. DÒNG TIÊU ĐỀ CHÍNH: In đậm, cỡ chữ 11 (Wait, "tiêu đề in đậm, cỡ chữ 16 căn giữa. nội dung cỡ chữ thường 14, căn giữa.")
        worksheet.mergeCells('A1:G1');
        const mainTitle = worksheet.getCell('A1');
        mainTitle.value = `LỊCH ĐẤU & ĐIỂM SỐ MỚI NHẤT - NỘI DUNG: ${String(evt.name).toUpperCase()}`;
        mainTitle.font = { name: 'Times New Roman', size: 16, bold: true };
        mainTitle.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(1).height = 40;

        // Dòng phụ đề
        worksheet.mergeCells('A2:G2');
        const subTitle = worksheet.getCell('A2');
        subTitle.value = `GIẢI ĐẤU: ${String(tournament.name).toUpperCase()} | Sân: ${tournament.location || 'Trung tâm'} | Ngày lập: 2026`;
        subTitle.font = { name: 'Times New Roman', size: 12, italic: true };
        subTitle.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(2).height = 25;

        // Dòng trống cách quãng
        worksheet.addRow([]);
        worksheet.getRow(3).height = 15;

        let curRowIdx = 4;

        // --- MỤC I. BẢNG XẾP HẠNG VÒNG BẢNG (Như một tiêu đề trung gian -> 16 bold căn giữa) ---
        worksheet.mergeCells(`A${curRowIdx}:G${curRowIdx}`);
        const m1Title = worksheet.getCell(`A${curRowIdx}`);
        m1Title.value = `I. BẢNG XẾP HẠNG VÒNG BẢNG`;
        m1Title.font = { name: 'Times New Roman', size: 16, bold: true };
        m1Title.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(curRowIdx).height = 30;
        curRowIdx++;

        // Dòng trống
        worksheet.addRow([]);
        worksheet.getRow(curRowIdx).height = 10;
        curRowIdx++;

        const groupList: any[] = Object.values(evt.groups || {});
        const stdByGrp: any = getEventStandings(evt);

        if (groupList.length === 0) {
          worksheet.mergeCells(`A${curRowIdx}:G${curRowIdx}`);
          const emptyCell = worksheet.getCell(`A${curRowIdx}`);
          emptyCell.value = 'Chưa thiết lập bảng đấu cho nội dung này';
          emptyCell.font = { name: 'Times New Roman', size: 14, italic: true };
          emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getRow(curRowIdx).height = 25;
          curRowIdx++;
        } else {
          groupList.forEach((group: any) => {
            // Tên Bảng đấu (Tiêu đề in đậm, cỡ chữ 11 -> 16 căn giữa)
            worksheet.mergeCells(`A${curRowIdx}:D${curRowIdx}`);
            const groupTitle = worksheet.getCell(`A${curRowIdx}`);
            groupTitle.value = `BẢNG ĐẤU: ${String(group.name).toUpperCase()}`;
            groupTitle.font = { name: 'Times New Roman', size: 16, bold: true };
            groupTitle.alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(curRowIdx).height = 28;
            curRowIdx++;

            // Headers của standings bảng
            const stdHeaders = ['Thứ hạng', 'Tên Đội tuyển / Vận động viên', 'Trận đã đấu', 'Điểm số'];
            const headerRow = worksheet.addRow([...stdHeaders]);
            worksheet.getRow(curRowIdx).height = 26;

            headerRow.eachCell((cell) => {
              cell.font = { name: 'Times New Roman', size: 14, bold: true };
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE8F4F8' }
              };
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'medium' },
                right: { style: 'thin' }
              };
            });
            curRowIdx++;

            const std = stdByGrp[group.id] || [];
            std.forEach((s: any, rankIndex: number) => {
              const dataRow = worksheet.addRow([
                rankIndex + 1,
                s.teamName || 'Không rõ',
                s.matchesPlayed || 0,
                `${s.points || 0}đ`
              ]);
              worksheet.getRow(curRowIdx).height = 25;

              dataRow.eachCell((cell) => {
                cell.font = { name: 'Times New Roman', size: 14 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = {
                  top: { style: 'thin' },
                  left: { style: 'thin' },
                  bottom: { style: 'thin' },
                  right: { style: 'thin' }
                };
              });
              curRowIdx++;
            });

            // Khoảng trống sau mỗi bảng
            worksheet.addRow([]);
            worksheet.getRow(curRowIdx).height = 12;
            curRowIdx++;
          });
        }

        // --- MỤC II. LỊCH THI ĐẤU & ĐIỂM SỐ MỚI NHẤT (Tiêu đề in đậm, cỡ chữ 11 -> 16 căn giữa) ---
        worksheet.mergeCells(`A${curRowIdx}:G${curRowIdx}`);
        const m2Title = worksheet.getCell(`A${curRowIdx}`);
        m2Title.value = `II. LỊCH THI ĐẤU & ĐIỂM SỐ MỚI NHẤT`;
        m2Title.font = { name: 'Times New Roman', size: 16, bold: true };
        m2Title.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(curRowIdx).height = 30;
        curRowIdx++;

        // Dòng trống
        worksheet.addRow([]);
        worksheet.getRow(curRowIdx).height = 10;
        curRowIdx++;

        // Header Trận đấu
        const matchesHeaders = ['STT', 'Bảng / Nhánh', 'Vòng đấu', 'Đội tuyển A (Thứ nhất)', 'Tỷ số', 'Đội tuyển B (Thứ hai)', 'Trạng thái'];
        const matchHeaderRow = worksheet.addRow([...matchesHeaders]);
        worksheet.getRow(curRowIdx).height = 28;

        matchHeaderRow.eachCell((cell) => {
          cell.font = { name: 'Times New Roman', size: 14, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8F4F8' }
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'medium' },
            right: { style: 'thin' }
          };
        });
        curRowIdx++;

        const evtMatches = evt.matches || [];
        if (evtMatches.length === 0) {
          worksheet.mergeCells(`A${curRowIdx}:G${curRowIdx}`);
          const emptyCell = worksheet.getCell(`A${curRowIdx}`);
          emptyCell.value = 'Chưa thiết lập lịch thi đấu nào';
          emptyCell.font = { name: 'Times New Roman', size: 14, italic: true };
          emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
          emptyCell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          worksheet.getRow(curRowIdx).height = 25;
          curRowIdx++;
        } else {
          // Sắp xếp tối ưu khoảng nghỉ (trận 1 bảng A, trận 1 bảng B, trận 1 bảng C...)
          const groupMtch = evtMatches.filter((m: any) => m.groupId !== 'knockout');
          const koMtch = evtMatches.filter((m: any) => m.groupId === 'knockout');

          const balancedGroupMatches = balanceMatchesRestTime(groupMtch);
          const sortedAllList = [...balancedGroupMatches, ...koMtch];

          sortedAllList.forEach((m: any, mIdx: number) => {
            const tAName = evt.teams[m.teamAId]?.name || getReadableTeamName(m.teamAId);
            const tBName = evt.teams[m.teamBId]?.name || getReadableTeamName(m.teamBId);

            let gLabel = 'Vòng loại trực tiếp';
            if (m.groupId !== 'knockout') {
              const grpo = evt.groups[m.groupId];
              gLabel = grpo ? grpo.name : `Bảng ${m.groupId}`;
            }

            let rLabel = `Vòng ${m.round}`;
            if (m.groupId === 'knockout') {
              rLabel = m.knockoutRoundName || 'Trực tiếp';
              if (m.knockoutMatchId) {
                rLabel += ` (${getReadableKoMatchName(m.knockoutMatchId)})`;
              }
            }

            const scText = m.status === 'finished' ? `${m.scoreA} - ${m.scoreB}` : 'Chờ đấu';
            
            let stText = 'Chưa đấu';
            if (m.status === 'finished') {
              stText = m.scoreA! > m.scoreB! ? 'A thắng' : m.scoreB! > m.scoreA! ? 'B thắng' : 'Hòa';
            }

            const rowData = worksheet.addRow([
              mIdx + 1,
              gLabel,
              rLabel,
              tAName,
              scText,
              tBName,
              stText
            ]);

            worksheet.getRow(curRowIdx).height = 26;

            rowData.eachCell((cell) => {
              cell.font = { name: 'Times New Roman', size: 14 };
              cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            });
            curRowIdx++;
          });
        }
      });

      // Tạo nhị phân tải xuống
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileSuffix = selectedEventFilter === 'all' ? 'toan_bo_noi_dung' : `noi_dung_${selectedEventFilter}`;
      link.download = `lich_va_ti_so_tv_${fileSuffix}_${Date.now()}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      if (addLog) {
        addLog('Xuất Excel TV', `Đã xuất lịch thi đấu & điểm số truyền hình các nội dung thành công.`);
      }
    } catch (err) {
      console.error('Lỗi xuất Excel TV:', err);
    }
  };

  const eventList = Object.values(events || {});

  // Hàm tính Standing cho một Event bất kỳ
  const getEventStandings = (evt: typeof events[string]) => {
    const stdRecord: Record<string, ReturnType<typeof calculateGroupStandings>> = {};
    const groupList = Object.values(evt.groups || {});
    groupList.forEach((g) => {
      const groupMatches = (evt.matches || []).filter((m) => m.groupId === g.id);
      stdRecord[g.id] = calculateGroupStandings(
        g.id, 
        g.teamIds, 
        groupMatches, 
        evt.teams || {}, 
        evt.settings
      );
    });
    return stdRecord;
  };

  return (
    <div
      className={`space-y-6 ${
        isFullscreen
          ? 'p-8 bg-zinc-950 text-white h-screen overflow-y-auto space-y-8 select-none'
          : ''
      }`}
      id="live-root-container"
    >
      {/* Khung điều khiển Live Projector */}
      <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h3 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Monitor size={18} className="text-blue-500 animate-pulse" />
            Live Dashboard (Chế độ Trình diễn TV Sân thi đấu)
          </h3>
          <p className="text-xs text-zinc-400">Trình chiếu sơ đồ thi đấu, điểm số trực tiếp của tất cả các nội dung cho khan giả tại sân.</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Lọc nội dung */}
          <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200/60 dark:border-zinc-850">
            <button
              onClick={() => setSelectedEventFilter('all')}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                selectedEventFilter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-205'
              }`}
            >
              Tất cả nội dung
            </button>
            {eventList.map((evt) => (
              <button
                key={evt.id}
                onClick={() => {
                  setSelectedEventFilter(evt.id);
                  setActiveCycleTab('standings');
                }}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  selectedEventFilter === evt.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-205'
                }`}
              >
                {evt.name}
              </button>
            ))}
          </div>

          {selectedEventFilter !== 'all' && (
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:text-zinc-100 rounded-xl cursor-pointer"
              title={isPlaying ? 'Dừng tự xoay vòng' : 'Chạy tự xoay vòng'}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            </button>
          )}

          <button
            onClick={handleExportLiveExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.01] active:scale-95 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all uppercase tracking-wider"
            id="btn-export-live-excel"
            title="Xuất Excel Lịch đấu & Điểm số"
          >
            <FileSpreadsheet size={14} />
            <span>Xuất Excel TV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.01] active:scale-95 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-all uppercase tracking-wider"
            id="btn-print-live-pdf"
            title="In hoặc lưu PDF lịch đấu & kết quả"
          >
            <Printer size={14} />
            <span>In / PDF TV</span>
          </button>

          <button
            onClick={handleToggleFullscreen}
            className="px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 font-bold rounded-xl text-xs cursor-pointer flex items-center gap-1.5"
          >
            <Maximize size={14} /> {isFullscreen ? 'Thoát Đầy Màn Hình' : 'Mở Đầy Màn Hình'}
          </button>
        </div>
      </div>

      {/* Header trình chiếu (Có Đồng hồ báo giờ thi đấu) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-blue-700 via-indigo-800 to-indigo-950 p-6 rounded-2xl text-white shadow-lg">
        <div className="space-y-1">
          <span className="text-[10px] bg-white/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest text-indigo-200">
            Bảng Điện Tử Trình Chiếu Toàn Giải
          </span>
          <h2 className="text-xl font-black tracking-tight">{tournament.name.toUpperCase()}</h2>
          <p className="text-xs text-blue-100 font-medium">BTC: {tournament.organization} | Sân: {tournament.location}</p>
        </div>

        <div className="flex items-center gap-2.5 bg-black/20 px-5 py-3 rounded-2xl border border-white/15 shrink-0">
          <Clock size={20} className="animate-spin duration-3000 text-blue-200" />
          <span className="font-mono text-xl font-black tracking-wider w-24 text-center">
            {currentTime || '09:40:00'}
          </span>
        </div>
      </div>

      {/* HIỂN THỊ TẨT CẢ NỘI DUNG (Sticked Grid View) */}
      {selectedEventFilter === 'all' ? (
        <div className="space-y-8" id="tv-all-events-view">
          {eventList.map((evt) => {
            const stdByGrp = getEventStandings(evt);
            const evtGroups = Object.values(evt.groups || {});
            const evtMatches = evt.matches || [];
            const koMatches = evtMatches.filter((m) => m.groupId === 'knockout');
            const pendingMatches = balanceMatchesRestTime(evtMatches.filter((m) => m.status === 'pending'));
            const finishedMatches = evtMatches.filter((m) => m.status === 'finished').slice(-4);

            return (
              <div 
                key={evt.id} 
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-805/80 rounded-3xl p-5 md:p-6 shadow-sm space-y-6"
              >
                {/* Dải Banner của từng Nội dung */}
                <div className="flex items-center justify-between border-b border-zinc-150 dark:border-zinc-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-xl text-blue-600 dark:text-blue-400">
                      <Trophy size={16} className="stroke-[2.5]" />
                    </span>
                    <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">
                      Cặp đấu: {evt.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-zinc-500">
                    <span className="bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1 rounded-lg">Đội: <strong className="text-zinc-850 dark:text-zinc-200">{Object.keys(evt.teams || {}).length}</strong></span>
                    <span className="bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1 rounded-lg">Bảng: <strong className="text-zinc-850 dark:text-zinc-200">{evtGroups.length}</strong></span>
                    <span className="bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1 rounded-lg">Trận: <strong className="text-zinc-850 dark:text-zinc-200">{evtMatches.length}</strong></span>
                  </div>
                </div>

                {/* Grid 3 phần chính cho nội dung */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Cột 1: Bảng Xếp Hạng Vòng Bảng */}
                  <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 py-3 px-4 rounded-2xl border border-zinc-150 dark:border-zinc-850">
                    <span className="flex items-center gap-1.5 text-xs font-black text-zinc-400 uppercase tracking-wider" style={{ color: '#c225a2', fontSize: '14px' }}>
                      <Layers size={13} /> Vòng bảng & Xếp hạng
                    </span>
                    {evtGroups.length === 0 ? (
                      <p className="text-[11px] text-zinc-400 py-6 text-center">Chưa chia bảng đấu.</p>
                    ) : (
                      <div className="space-y-4 max-h-[350px] overflow-y-auto">
                        {evtGroups.map((group) => {
                          const std = stdByGrp[group.id] || [];
                          return (
                            <div key={group.id} className="space-y-1.5">
                              <h5 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wide" style={{ fontSize: '13px' }}>
                                ● {group.name}
                              </h5>
                              <div className="space-y-1">
                                {std.map((s, idx) => (
                                  <div key={s.teamId} className="flex justify-between items-center bg-white dark:bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-100 dark:border-zinc-850 text-[11px]">
                                    <div className="flex items-center gap-2 truncate max-w-[70%]">
                                      <span className="font-bold text-zinc-400 text-[10px] w-3">{idx + 1}</span>
                                      <span className="font-extrabold text-zinc-700 dark:text-zinc-300 truncate" style={{ fontSize: '14px' }}>{s.teamName}</span>
                                    </div>
                                    <span className="font-extrabold text-blue-600 shrink-0">{s.points}đ</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Cột 2: Tiến Độ Lịch Thi Đấu */}
                  <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 py-3 px-4 rounded-2xl border border-zinc-150 dark:border-zinc-850">
                    <span className="flex items-center gap-1.5 text-xs font-black text-zinc-400 uppercase tracking-wider" style={{ fontSize: '14px', borderColor: '#3fb536', color: '#b5117e' }}>
                      <Clock size={13} /> Lịch đấu & Điểm số mới nhất
                    </span>
                    
                    <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                      {pendingMatches.length === 0 && finishedMatches.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 py-6 text-center">Chưa có lịch thi đấu.</p>
                      ) : (
                        <>
                          {pendingMatches.length > 0 && (
                            <div className="space-y-1">
                              <h5 className="text-[9px] font-bold text-amber-500 uppercase tracking-wider" style={{ fontSize: '13px' }}>Trận Đang / Sắp diễn ra</h5>
                              {pendingMatches.map((m) => {
                                const teamA = evt.teams[m.teamAId]?.name || m.teamAId;
                                const teamB = evt.teams[m.teamBId]?.name || m.teamBId;
                                return (
                                  <div key={m.id} className="flex justify-between items-center bg-white dark:bg-zinc-950 py-1 px-3 rounded-lg border border-zinc-100 dark:border-zinc-850 text-[11px]">
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[80%]" style={{ fontSize: '14px', color: '#010104' }}>{teamA} vs {teamB}</span>
                                    <span className="text-[9px] font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-900 px-1 py-0.5 rounded leading-none shrink-0 border border-zinc-200/50 dark:border-zinc-805">CHỜ</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {finishedMatches.length > 0 && (
                            <div className="space-y-1">
                              <h5 className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Vừa kết thúc</h5>
                              {finishedMatches.map((m) => {
                                const teamA = evt.teams[m.teamAId]?.name || m.teamAId;
                                const teamB = evt.teams[m.teamBId]?.name || m.teamBId;
                                return (
                                  <div key={m.id} className="flex justify-between items-center bg-emerald-500/[0.02] py-1 px-3 rounded-lg border border-emerald-100/55 dark:border-emerald-900/10 text-[11px]">
                                    <span className="font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[70%]">{teamA} vs {teamB}</span>
                                    <strong className="font-mono font-black text-emerald-600 leading-none bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded shrink-0">{m.scoreA} - {m.scoreB}</strong>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Cột 3: Sơ đồ Knockout */}
                  <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 py-3 px-4 rounded-2xl border border-zinc-150 dark:border-zinc-850">
                    <span className="flex items-center gap-1.5 text-xs font-black text-zinc-400 uppercase tracking-wider" style={{ color: '#c81d59', fontSize: '14px' }}>
                      <GitCommit size={13} /> Sơ đồ Trực tiếp Knockout
                    </span>
                    
                    {koMatches.length === 0 ? (
                      <p className="text-[11px] text-zinc-400 py-6 text-center">Chưa lập sơ đồ Knockout.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-[350px] overflow-y-auto">
                        {Array.from(new Set(koMatches.map((m) => m.round))).sort((a,b)=>a-b).map((round) => {
                          const roundMatches = koMatches.filter((m) => m.round === round);
                          const roundName = roundMatches[0]?.knockoutRoundName || 'Vòng';
                          return (
                            <div key={round} className="space-y-1 bg-white dark:bg-zinc-950 py-1.5 px-2.5 rounded-xl border border-zinc-100 dark:border-zinc-850">
                              <h6 className="text-[9px] font-black text-zinc-400 border-b pb-1 mb-1.5 uppercase select-none" style={{ fontSize: '13px', color: '#c61a8b' }}>{roundName}</h6>
                              <div className="grid grid-cols-1 gap-1">
                                {roundMatches.map((m) => {
                                  const teamAName = evt.teams[m.teamAId]?.name || getReadableTeamName(m.teamAId);
                                  const teamBName = evt.teams[m.teamBId]?.name || getReadableTeamName(m.teamBId);
                                  return (
                                    <div key={m.id} className="text-[10px] space-y-1 p-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-lg">
                                      <div className="text-[8px] font-black text-zinc-450 border-b border-zinc-200/30 dark:border-zinc-805 pb-0.5 mb-1 select-none" style={{ fontSize: '13px', color: '#992371' }}>
                                        {getReadableKoMatchName(m.knockoutMatchId || '')}
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className={`font-bold truncate max-w-[85%] ${m.winnerId === m.teamAId ? 'text-blue-600' : 'text-zinc-500'}`} style={{ fontSize: '15px', color: '#0f0fb1' }}>{teamAName}</span>
                                        <strong className="font-mono text-zinc-650 dark:text-zinc-350 shrink-0">{m.status === 'finished' ? m.scoreA : '-'}</strong>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span className={`font-bold truncate max-w-[85%] ${m.winnerId === m.teamBId ? 'text-blue-600' : 'text-zinc-500'}`} style={{ fontSize: '15px', color: '#0f0fb1' }}>{teamBName}</span>
                                        <strong className="font-mono text-zinc-650 dark:text-zinc-350 shrink-0">{m.status === 'finished' ? m.scoreB : '-'}</strong>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* HIỂN THỊ CHI TIẾT 1 NỘI DUNG THI ĐẤU (Single Specific Event View) */
        <div className="space-y-6" id="tv-single-event-view">
          {(() => {
            const currentEvt = events[selectedEventFilter];
            if (!currentEvt) return <div className="py-20 text-center text-zinc-550">Lỗi: Nội dung trống.</div>;

            const stdByGrp = getEventStandings(currentEvt);
            const evtGroups = Object.values(currentEvt.groups || {});
            const evtMatches = currentEvt.matches || [];
            const koMatches = evtMatches.filter((m) => m.groupId === 'knockout');
            const pendingMatches = balanceMatchesRestTime(evtMatches.filter((m) => m.status === 'pending'));
            const finishedMatches = evtMatches.filter((m) => m.status === 'finished').slice(-10);

            return (
              <>
                {/* Tabs chuyển slide thủ công cho Event riêng lẻ */}
                <div className="flex bg-zinc-100 dark:bg-zinc-950 p-1 rounded-2xl border border-zinc-200/40 dark:border-zinc-850">
                  {(['standings', 'matches', 'bracket'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveCycleTab(tab);
                        setIsPlaying(false);
                      }}
                      className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        activeCycleTab === tab
                          ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-204'
                      }`}
                    >
                      {tab === 'standings' ? 'Bảng Xếp Hạng Vòng Bảng' : tab === 'matches' ? 'Tiến Độ Trận Đấu' : 'Sơ đồ Knockout'}
                    </button>
                  ))}
                </div>

                {/* Nội dung chi tiết */}
                <div className="py-2 animate-fade-in">
                  {activeCycleTab === 'standings' && (
                    <div className="space-y-8">
                      {evtGroups.length === 0 ? (
                        <div className="py-20 text-center text-zinc-500 border border-dashed border-zinc-200 rounded-3xl bg-zinc-50/50">Chưa bốc bảng thi đấu.</div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {evtGroups.map((group) => {
                            const std = stdByGrp[group.id] || [];
                            return (
                              <div key={group.id} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                                <h4 className="text-sm font-black text-blue-600 dark:text-blue-400 border-b pb-2.5 border-zinc-200 dark:border-zinc-800 border-dashed uppercase tracking-wider select-none">
                                  ● {group.name.toUpperCase()}
                                </h4>

                                <div className="space-y-3">
                                  {std.map((s, index) => (
                                    <div key={s.teamId} className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-100 dark:border-zinc-850">
                                      <div className="flex items-center gap-3 truncate max-w-[70%]">
                                        <span className={`h-6 w-6 font-bold text-xs flex items-center justify-center rounded-lg ${index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-400'}`}>
                                          {index + 1}
                                        </span>
                                        <span className="font-extrabold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                                          {s.teamName}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-4 text-xs shrink-0">
                                        <span className="text-zinc-400 font-semibold">{s.matchesPlayed} Trận</span>
                                        <span className="font-extrabold text-blue-600">{s.points} Điểm</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeCycleTab === 'matches' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Trận đấu sắp diễn ra */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-extrabold text-zinc-400 flex items-center gap-2 uppercase tracking-wider">
                          <Clock size={14} /> TRẬN ĐẤU SẮP DIỄN RA ({currentEvt.name})
                        </h4>

                        {pendingMatches.length === 0 ? (
                          <div className="py-8 text-center text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 select-none">
                            Hoàn tất toàn bộ lịch vòng bảng này!
                          </div>
                        ) : (
                          <div className="space-y-1 max-h-[550px] overflow-y-auto pr-1">
                            {pendingMatches.map((m) => {
                              const teamAName = currentEvt.teams[m.teamAId]?.name || getReadableTeamName(m.teamAId);
                              const teamBName = currentEvt.teams[m.teamBId]?.name || getReadableTeamName(m.teamBId);
                              const group = currentEvt.groups[m.groupId];

                              return (
                                <div key={m.id} className="py-1 px-3.5 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-150 dark:border-zinc-850 flex items-center justify-between shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                                  <div className="space-y-0.5 max-w-[70%]">
                                    <p className="text-xs font-bold text-zinc-850 dark:text-zinc-100 truncate">
                                      {teamAName} <span className="text-zinc-400 font-normal">vs</span> {teamBName}
                                    </p>
                                    <span className="inline-block py-0.5 px-1.5 bg-blue-50 text-blue-805 dark:bg-blue-950/20 dark:text-blue-300 font-bold rounded text-[8.5px]">
                                      {group ? group.name : 'Knockout'} - Vòng {m.round}
                                    </span>
                                  </div>
                                  <span className="text-[9.5px] font-black text-zinc-405 shrink-0 select-none tracking-wider">CHỜ SÂN</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Trận đấu mới kết thúc */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-extrabold text-emerald-600 dark:text-emerald-450 flex items-center gap-2 uppercase tracking-wider">
                          <Award size={14} /> TRẬN ĐẤU MỚI KẾT THÚC ({currentEvt.name})
                        </h4>

                        {finishedMatches.length === 0 ? (
                          <div className="py-8 text-center text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                            Chưa có trận nào hoàn tất ghi nhận tỉ số.
                          </div>
                        ) : (
                          <div className="space-y-1 max-h-[550px] overflow-y-auto pr-1">
                            {finishedMatches.map((m) => {
                              const teamAName = currentEvt.teams[m.teamAId]?.name || getReadableTeamName(m.teamAId);
                              const teamBName = currentEvt.teams[m.teamBId]?.name || getReadableTeamName(m.teamBId);
                              const group = currentEvt.groups[m.groupId];

                              return (
                                <div key={m.id} className="py-1 px-3.5 bg-emerald-550/[0.01] rounded-lg border border-emerald-100 dark:border-emerald-900/10 flex items-center justify-between shadow-xs">
                                  <div className="space-y-0.5 max-w-[70%]">
                                    <p className="text-xs font-bold text-zinc-850 dark:text-zinc-100 truncate">
                                      {teamAName} <span className="text-zinc-400 font-normal">vs</span> {teamBName}
                                    </p>
                                    <span className="inline-block py-0.5 px-1.5 bg-emerald-50 text-emerald-805 dark:bg-emerald-950/20 dark:text-emerald-350 font-bold rounded text-[8.5px]">
                                      {group ? group.name : 'Knockout'} - Vòng {m.round}
                                    </span>
                                  </div>
                                  <span className="font-mono font-black text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded shrink-0 leading-none">
                                    {m.scoreA} - {m.scoreB}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeCycleTab === 'bracket' && (
                    <div id="live-bracket-slide">
                      {koMatches.length === 0 ? (
                        <div className="py-20 text-center text-zinc-500 border border-dashed border-zinc-200 rounded-3xl bg-zinc-50/50">Chưa lập sơ đồ Knockout cho nội dung này.</div>
                      ) : (
                        <div className="p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                          <div className="flex justify-around min-w-[700px] gap-8">
                            {Array.from(new Set(koMatches.map((m) => m.round))).sort((a,b)=>a-b).map((round) => {
                              const roundMatches = koMatches.filter((m) => m.round === round);
                              const name = roundMatches[0]?.knockoutRoundName || 'Vòng';
                              
                              return (
                                <div key={round} className="flex-1 flex flex-col gap-6">
                                  <h5 className="text-center text-[10px] font-black text-zinc-450 border-b pb-2 uppercase tracking-wider">{name}</h5>
                                  <div className="flex flex-col justify-around h-[300px] gap-4">
                                    {roundMatches.map((m) => {
                                      const teamAName = currentEvt.teams[m.teamAId]?.name || getReadableTeamName(m.teamAId);
                                      const teamBName = currentEvt.teams[m.teamBId]?.name || getReadableTeamName(m.teamBId);
                                      return (
                                        <div key={m.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-2xl text-xs space-y-1.5 shadow-xs">
                                          <div className="text-[8px] font-black text-zinc-450 border-b border-zinc-200/40 dark:border-zinc-800 pb-0.5 mb-1 select-none">
                                            {getReadableKoMatchName(m.knockoutMatchId || '')}
                                          </div>
                                          <div className="flex justify-between items-center font-bold">
                                            <span className={m.winnerId === m.teamAId ? 'text-blue-600' : 'text-zinc-500 truncate max-w-[80%]'}>{teamAName}</span>
                                            <span className="font-mono font-bold leading-none shrink-0">{m.status === 'finished' ? m.scoreA : '-'}</span>
                                          </div>
                                          <div className="flex justify-between items-center font-bold">
                                            <span className={m.winnerId === m.teamBId ? 'text-blue-600' : 'text-zinc-500 truncate max-w-[80%]'}>{teamBName}</span>
                                            <span className="font-mono font-bold leading-none shrink-0">{m.status === 'finished' ? m.scoreB : '-'}</span>
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
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}
