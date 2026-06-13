/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Grid
} from 'lucide-react';

interface AutoScrollListProps {
  children: React.ReactNode;
  className?: string;
  maxHeight?: string;
}

function AutoScrollList({ children, className = '', maxHeight = '350px' }: AutoScrollListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    
    // Disable auto-scroll on mobile to allow native scrolling and full display
    if (window.innerWidth < 1024) return;

    let timer: any;
    let scrollDirection = 1; // 1 for down, -1 for up
    let pauseCounter = 0;

    const scroll = () => {
      if (!element) return;
      const { scrollTop, scrollHeight, clientHeight } = element;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll <= 2) {
        element.scrollTop = 0;
        timer = setTimeout(scroll, 1000);
        return;
      }

      if (pauseCounter > 0) {
        pauseCounter--;
        timer = setTimeout(scroll, 35);
        return;
      }

      let nextScroll = scrollTop + scrollDirection * 0.7; // Slow and gentle scroll

      if (nextScroll >= maxScroll) {
        nextScroll = maxScroll;
        scrollDirection = -1;
        pauseCounter = 60; // Pause for ~2 seconds at bottom
      } else if (nextScroll <= 0) {
        nextScroll = 0;
        scrollDirection = 1;
        pauseCounter = 60; // Pause for ~2 seconds at top
      }

      element.scrollTop = nextScroll;
      timer = setTimeout(scroll, 35);
    };

    pauseCounter = 60; // Initial delay
    timer = setTimeout(scroll, 1500);

    return () => clearTimeout(timer);
  }, [children]);

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto pr-1 ${className}`}
      style={{ maxHeight: window.innerWidth >= 1024 ? maxHeight : 'none', scrollBehavior: 'auto' }}
    >
      {children}
    </div>
  );
}

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
      {/* Thanh điều khiển siêu tối giản, không viền, không hộp (xóa bỏ phần khung cồng kềnh) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-transparent py-1 print:hidden" id="live-minimal-controls-bar">
        {/* Lọc nội dung siêu gọn */}
        <div className="flex items-center gap-1 bg-zinc-250/50 dark:bg-zinc-900/60 p-1 rounded-xl border border-zinc-300/20 dark:border-zinc-800">
          <button
            onClick={() => setSelectedEventFilter('all')}
            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer select-none ${
              selectedEventFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-zinc-650 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-amber-200'
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
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer select-none ${
                selectedEventFilter === evt.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-zinc-650 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-amber-200'
              }`}
            >
              {evt.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {selectedEventFilter !== 'all' && (
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 text-zinc-650 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-250/50 dark:bg-zinc-900/60 rounded-xl cursor-pointer transition-colors"
              title={isPlaying ? 'Dừng tự xoay vòng' : 'Chạy tự xoay vòng'}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
          )}

          <button
            onClick={handleToggleFullscreen}
            className="px-4 py-2 bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 font-black rounded-xl text-xs cursor-pointer flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Maximize size={13} /> {isFullscreen ? 'Thoát TV' : 'Mở Đầy Màn Hình'}
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
                      <AutoScrollList maxHeight="350px" className="space-y-4">
                        {evtGroups.map((group) => {
                          const std = stdByGrp[group.id] || [];
                          return (
                            <div key={group.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-805 overflow-hidden shadow-sm mb-4">
                              {/* Header Bar */}
                              <div className="bg-blue-600 text-white py-2 px-3 flex items-center justify-between">
                                <span className="text-[11px] font-extrabold flex items-center gap-1.5 tracking-tight uppercase">
                                  <Award size={13} /> BẢNG XẾP HẠNG - {group.name}
                                </span>
                                <span className="text-[9px] font-bold bg-white/20 px-2 py-0.5 rounded-full border border-white/20 select-none hidden sm:inline-block">
                                  Bảng {group.teamIds?.length || std.length} đội
                                </span>
                              </div>
                              {/* Table Data */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[11px]">
                                  <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold text-[10px] md:text-[11px]">
                                      <th className="py-2 px-2 text-center w-8">Hạng</th>
                                      <th className="py-2 px-2 text-left min-w-[90px]">Đội tuyển</th>
                                      <th className="py-2 px-1.5 text-center">Trận</th>
                                      <th className="py-2 px-1.5 text-center text-emerald-600">T</th>
                                      <th className="py-2 px-1.5 text-center text-red-500">B</th>
                                      <th className="py-2 px-1.5 text-center text-zinc-500">H/S</th>
                                      <th className="py-2 px-2 text-center text-blue-600">Điểm</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {std.map((s, idx) => {
                                      let rankBadge = null;
                                      if (idx === 0) {
                                        rankBadge = <span className="w-5 h-5 rounded-full inline-flex items-center justify-center font-bold text-[10px] bg-amber-100 text-amber-800 border border-amber-200/40">1</span>;
                                      } else if (idx === 1) {
                                        rankBadge = <span className="w-5 h-5 rounded-full inline-flex items-center justify-center font-bold text-[10px] bg-zinc-150 text-zinc-700 border border-zinc-200/40">2</span>;
                                      } else {
                                        rankBadge = <span className="text-zinc-400 font-bold block">{idx + 1}</span>;
                                      }

                                      return (
                                        <tr key={s.teamId} className="border-b border-zinc-100 dark:border-zinc-850/60 hover:bg-zinc-50 dark:hover:bg-zinc-850/10">
                                          <td className="py-2 px-2 text-center font-bold text-[11px]">
                                            <span className="flex justify-center items-center">{rankBadge}</span>
                                          </td>
                                          <td className="py-2 px-2 font-extrabold text-zinc-700 dark:text-zinc-300 truncate max-w-[130px] text-[12px]">{s.teamName}</td>
                                          <td className="py-2 px-1.5 text-center text-zinc-600 dark:text-zinc-400 font-medium">{s.matchesPlayed}</td>
                                          <td className="py-2 px-1.5 text-center text-emerald-600 font-bold">{s.matchesWon}</td>
                                          <td className="py-2 px-1.5 text-center text-red-500 font-bold">{s.matchesLost}</td>
                                          <td className="py-2 px-1.5 text-center text-zinc-500 font-medium">{s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff === 0 ? 'Ø' : s.pointDiff}</td>
                                          <td className="py-2 px-2 text-center font-extrabold text-blue-600 text-[13px]">{s.points}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </AutoScrollList>
                    )}
                  </div>

                  {/* Cột 2: Tiến Độ Lịch Thi Đấu */}
                  <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 py-3 px-4 rounded-2xl border border-zinc-150 dark:border-zinc-850">
                    <span className="flex items-center gap-1.5 text-xs font-black text-zinc-400 uppercase tracking-wider" style={{ fontSize: '14px', borderColor: '#3fb536', color: '#b5117e' }}>
                      <Clock size={13} /> Lịch đấu & Điểm số mới nhất
                    </span>
                    
                    <AutoScrollList maxHeight="350px" className="space-y-1.5 pb-2">
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
                                  <div key={m.id} className="flex justify-between items-center bg-white dark:bg-zinc-950 py-1.5 px-3 rounded-lg border border-zinc-100 dark:border-zinc-850 text-[11px]">
                                    <div className="flex flex-col flex-1 pr-2 overflow-hidden">
                                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" style={{ fontSize: '13px' }}>{teamA}</span>
                                      <div className="w-0.5 h-2.5 bg-orange-400 mx-2 my-0.5"></div>
                                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" style={{ fontSize: '13px' }}>{teamB}</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-zinc-400 bg-zinc-50 dark:bg-zinc-900 px-1.5 py-1 rounded leading-none shrink-0 border border-zinc-200/50 dark:border-zinc-850">CHỜ</span>
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
                                  <div key={m.id} className="flex justify-between items-center bg-emerald-500/[0.02] py-1.5 px-3 rounded-lg border border-emerald-100/55 dark:border-emerald-900/10 text-[11px]">
                                    <div className="flex flex-col flex-1 pr-2 overflow-hidden">
                                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" style={{ fontSize: '13px' }}>{teamA}</span>
                                      <div className="w-0.5 h-2.5 bg-orange-400 mx-2 my-0.5"></div>
                                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" style={{ fontSize: '13px' }}>{teamB}</span>
                                    </div>
                                    <strong className="font-mono font-black text-emerald-600 text-[13px] leading-none bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1.5 rounded shrink-0">{m.scoreA} - {m.scoreB}</strong>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </AutoScrollList>
                  </div>

                  {/* Cột 3: Sơ đồ Knockout */}
                  <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-950/20 py-3 px-4 rounded-2xl border border-zinc-150 dark:border-zinc-850">
                    <span className="flex items-center gap-1.5 text-xs font-black text-zinc-400 uppercase tracking-wider" style={{ color: '#c81d59', fontSize: '14px' }}>
                      <GitCommit size={13} /> Sơ đồ Trực tiếp Knockout
                    </span>
                    
                    {koMatches.length === 0 ? (
                      <p className="text-[11px] text-zinc-400 py-6 text-center">Chưa lập sơ đồ Knockout.</p>
                    ) : (
                      <AutoScrollList maxHeight="350px" className="space-y-1.5 pb-2">
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
                      </AutoScrollList>
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
                              <div key={group.id} className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                                <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
                                  <span className="text-sm font-extrabold flex items-center gap-2 tracking-tight uppercase">
                                    <Award size={17} />
                                    Bảng xếp hạng hiện tại - {group.name}
                                  </span>
                                  <span className="text-[10px] font-bold bg-white/20 px-2.5 py-1 rounded-full border border-white/20 select-none hidden sm:inline-block">
                                    Bảng {group.teamIds?.length || std.length} đội
                                  </span>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs min-w-[400px]">
                                    <thead>
                                      <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-bold">
                                        <th className="py-3 px-3 text-center w-12">Hạng</th>
                                        <th className="py-3 px-3 text-left">Đội tuyển</th>
                                        <th className="py-3 px-2.5 text-center">Trận</th>
                                        <th className="py-3 px-2.5 text-center text-emerald-600">T</th>
                                        <th className="py-3 px-2.5 text-center text-red-500">B</th>
                                        <th className="py-3 px-2.5 text-center text-zinc-500">H/S</th>
                                        <th className="py-3 px-3 text-center text-blue-600">Điểm</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {std.map((s, index) => {
                                        let rankBadge = null;
                                        if (index === 0) {
                                          rankBadge = <span className="w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-xs bg-amber-100 text-amber-800 border border-amber-200/40">1</span>;
                                        } else if (index === 1) {
                                          rankBadge = <span className="w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-xs bg-zinc-150 text-zinc-700 border border-zinc-200/40">2</span>;
                                        } else {
                                          rankBadge = <span className="text-zinc-400 font-bold w-6 text-center block">{index + 1}</span>;
                                        }

                                        return (
                                          <tr key={s.teamId} className="border-b border-zinc-100 dark:border-zinc-850/60 hover:bg-zinc-50/50 dark:hover:bg-zinc-850/10 transition-colors">
                                            <td className="py-3.5 px-3 text-center font-bold">
                                              <span className="flex justify-center items-center">{rankBadge}</span>
                                            </td>
                                            <td className="py-3.5 px-3 font-extrabold text-zinc-700 dark:text-zinc-300 text-sm truncate max-w-[150px]">{s.teamName}</td>
                                            <td className="py-3.5 px-2.5 text-center text-zinc-600 dark:text-zinc-400 font-medium">{s.matchesPlayed}</td>
                                            <td className="py-3.5 px-2.5 text-center text-emerald-600 font-bold">{s.matchesWon}</td>
                                            <td className="py-3.5 px-2.5 text-center text-red-500 font-bold">{s.matchesLost}</td>
                                            <td className="py-3.5 px-2.5 text-center text-zinc-500 font-medium">{s.pointDiff > 0 ? `+${s.pointDiff}` : s.pointDiff === 0 ? 'Ø' : s.pointDiff}</td>
                                            <td className="py-3.5 px-3 text-center font-black text-blue-600 text-base">{s.points}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
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
                          <AutoScrollList maxHeight="400px" className="space-y-1 pr-1">
                            {pendingMatches.map((m) => {
                              const teamAName = currentEvt.teams[m.teamAId]?.name || getReadableTeamName(m.teamAId);
                              const teamBName = currentEvt.teams[m.teamBId]?.name || getReadableTeamName(m.teamBId);
                              const group = currentEvt.groups[m.groupId];

                              return (
                                <div key={m.id} className="py-1.5 px-3.5 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-150 dark:border-zinc-850 flex items-center justify-between shadow-xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                                  <div className="space-y-1 max-w-[70%] flex-1 pr-2">
                                    <div className="flex flex-col">
                                      <p className="text-[13.5px] font-bold text-zinc-850 dark:text-zinc-100 truncate">
                                        {teamAName}
                                      </p>
                                      <div className="w-0.5 h-3 bg-orange-400 mx-2 my-0.5"></div>
                                      <p className="text-[13.5px] font-bold text-zinc-850 dark:text-zinc-100 truncate">
                                        {teamBName}
                                      </p>
                                    </div>
                                    <span className="inline-block py-0.5 px-1.5 bg-blue-50 text-blue-805 dark:bg-blue-950/20 dark:text-blue-300 font-bold rounded text-[9.5px]">
                                      {group ? group.name : 'Knockout'} - Vòng {m.round}
                                    </span>
                                  </div>
                                  <span className="text-[10px] py-1.5 px-2 bg-zinc-100 dark:bg-zinc-900 rounded font-black text-zinc-500 shrink-0 select-none tracking-wider">CHỜ SÂN</span>
                                </div>
                              );
                            })}
                          </AutoScrollList>
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
                          <AutoScrollList maxHeight="400px" className="space-y-1 pr-1">
                            {finishedMatches.map((m) => {
                              const teamAName = currentEvt.teams[m.teamAId]?.name || getReadableTeamName(m.teamAId);
                              const teamBName = currentEvt.teams[m.teamBId]?.name || getReadableTeamName(m.teamBId);
                              const group = currentEvt.groups[m.groupId];

                              return (
                                <div key={m.id} className="py-1.5 px-3.5 bg-emerald-550/[0.01] rounded-lg border border-emerald-100 dark:border-emerald-900/10 flex items-center justify-between shadow-xs">
                                  <div className="space-y-1 max-w-[70%] flex-1 pr-2">
                                    <div className="flex flex-col">
                                      <p className="text-[13.5px] font-bold text-zinc-850 dark:text-zinc-100 truncate">
                                        {teamAName}
                                      </p>
                                      <div className="w-0.5 h-3 bg-orange-400 mx-2 my-0.5"></div>
                                      <p className="text-[13.5px] font-bold text-zinc-850 dark:text-zinc-100 truncate">
                                        {teamBName}
                                      </p>
                                    </div>
                                    <span className="inline-block py-0.5 px-1.5 bg-emerald-50 text-emerald-805 dark:bg-emerald-950/20 dark:text-emerald-350 font-bold rounded text-[9.5px]">
                                      {group ? group.name : 'Knockout'} - Vòng {m.round}
                                    </span>
                                  </div>
                                  <span className="font-mono font-black text-[14px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-1.5 rounded shrink-0 leading-none">
                                    {m.scoreA} - {m.scoreB}
                                  </span>
                                </div>
                              );
                            })}
                          </AutoScrollList>
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
