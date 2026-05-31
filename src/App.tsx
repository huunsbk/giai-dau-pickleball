/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { useTournamentStore } from './store';

// Importing Tab Components
import Dashboard from './components/Dashboard';
import TeamManager from './components/TeamManager';
import GroupManager from './components/GroupManager';
import SchedulerAndScoreKeeper from './components/SchedulerAndScoreKeeper';
import Standings from './components/Standings';
import KnockoutBracket from './components/KnockoutBracket';
import LiveDashboard from './components/LiveDashboard';
import AuditLogger from './components/AuditLogger';
import EventBar from './components/EventBar';

import {
  Trophy,
  Users,
  Layers,
  CalendarDays,
  FileSpreadsheet,
  Network,
  Tv,
  ClipboardList,
  Sun,
  Moon,
  Zap
} from 'lucide-react';

export default function App() {
  const {
    tournament,
    darkMode,
    setDarkMode,
    selectedTab,
    setSelectedTab,
  } = useTournamentStore();

  // Áp dụng lớp .dark lên thẻ HTML chính của Toàn giải
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const navItems = [
    { id: 'dashboard', label: 'Trang chủ', icon: Trophy },
    { id: 'teams', label: 'Quản lý đội', icon: Users },
    { id: 'groups', label: 'Chia bảng', icon: Layers },
    { id: 'matches', label: 'Lịch & Kết quả', icon: CalendarDays },
    { id: 'standings', label: 'Tuyển chọn vòng trong', icon: FileSpreadsheet },
    { id: 'knockout', label: 'Sơ đồ trực tiếp', icon: Network },
    { id: 'live', label: 'Bảng trình chiếu TV', icon: Tv },
    { id: 'logs', label: 'Nhật ký hệ thống', icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans transition-colors duration-250">
      
      {/* Cấu trúc Grid 12 cột cho toàn màn hình: Cột Trái Sidebar tối, Cột Phải Content cực rộng */}
      <div className="flex flex-col lg:flex-row min-h-screen">
        
        {/* Sidebar kiểu mẫu Thể Thao Pro - Nền Navy tối Đậm [bg-[#0f172a] hoặc bg-[#111c30]] */}
        <aside className="w-full lg:w-64 bg-[#111c30] text-slate-200 flex flex-col shrink-0 border-r border-[#1e293b] print:hidden">
          {/* Logo & Brand Giải đấu */}
          <div className="p-4 border-b border-[#1e293b] flex items-center gap-2.5">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md animate-pulse">
              <Trophy size={18} className="stroke-[2.5]" id="logo-badge" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white leading-tight uppercase font-display flex items-center gap-1">
                PickleMgr Pro
              </h1>
              <p className="text-[9px] text-slate-400 font-medium tracking-wide">Điều Hành Giải Chuyên Nghiệp</p>
            </div>
          </div>

          {/* Menu Điều Hướng Chính */}
          <div className="flex-1 p-3 space-y-1 overflow-y-auto">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2.5 mb-2">
              Menu Vận Hành (Live)
            </p>
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = selectedTab === item.id;
                
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      // Nếu bấm tab matches, reset active group trong store nếu chưa có
                      setSelectedTab(item.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold tracking-normal transition-all duration-150 text-left cursor-pointer group ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md font-extrabold translate-x-1'
                        : 'text-slate-300 hover:bg-[#1e293b]/70 hover:text-white'
                    }`}
                    id={`nav-item-${item.id}`}
                  >
                    <Icon size={15} className={`transition-transform duration-150 group-hover:scale-110 ${isActive ? 'text-white stroke-[2.5]' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Sidebar: Bản quyền & Giao diện sáng tối */}
          <div className="p-3.5 border-t border-[#1e293b] bg-[#0e1726]/80 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                <Zap size={10} className="text-amber-400 fill-amber-400/20" /> Hệ thống Offline
              </span>
              <span className="text-[8px] text-slate-500 mt-0.5">Quốc Tế - 2026</span>
            </div>

            {/* Nút Đổi Sáng Tối */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-[#1e293b] hover:bg-slate-800 text-slate-350 hover:text-white transition-all cursor-pointer border border-slate-700/50"
              id="btn-toggle-darkmode"
              title="Đổi giao diện Sáng / Tối"
            >
              {darkMode ? <Sun size={13} className="text-amber-400 fill-amber-300/15" /> : <Moon size={13} />}
            </button>
          </div>
        </aside>

        {/* Nội dung Content chính bên phải */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Header Bar thông báo tên giải chuyên nghiệp */}
          <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-5 py-2.5 flex items-center justify-between shadow-xs print:hidden">
            <div className="space-y-0.5">
              <p className="text-[8px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest leading-none">Cổng Điều Hành Trực Tuyến</p>
              <h2 className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 max-w-2xl truncate">
                {tournament.name || 'HỆ THỐNG QUẢN LÝ GIẢI ĐẤU PICKLEBALL'}
                <span className="text-[8px] bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400 font-bold px-1.5 py-0.5 rounded-full border border-red-200/60 dark:border-red-900/20">
                  STANDARD V2.6
                </span>
              </h2>
            </div>
            
            <div className="flex items-center gap-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="hidden sm:inline">BTC: <strong className="text-zinc-700 dark:text-zinc-300">{tournament.organization || 'Ban Tổ Chức'}</strong></span>
              <span className="h-3 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:inline"></span>
              <span className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-350 px-2 py-0.5 rounded-md font-bold text-[10px] border border-emerald-250">
                ● Trực Tiếp
              </span>
            </div>
          </header>

          {/* Outer Wrapper cho màn hình chính - Mở rộng toàn bộ chiều rộng (Full Width) */}
          <main className="flex-1 p-4 lg:p-6 w-full print:p-0 print:w-full" id="main-content-panel">
            {selectedTab !== 'live' && selectedTab !== 'logs' && <EventBar />}
            
            <div className="animate-fade-in">
              {selectedTab === 'dashboard' && <Dashboard />}
              {selectedTab === 'teams' && <TeamManager />}
              {selectedTab === 'groups' && <GroupManager />}
              {selectedTab === 'matches' && <SchedulerAndScoreKeeper />}
              {selectedTab === 'standings' && <Standings />}
              {selectedTab === 'knockout' && <KnockoutBracket />}
              {selectedTab === 'live' && <LiveDashboard />}
              {selectedTab === 'logs' && <AuditLogger />}
            </div>
          </main>

          {/* Footer chân bàn ăn mờ */}
          <footer className="py-3 border-t border-zinc-200/30 dark:border-zinc-900 text-center text-[11px] text-zinc-400 dark:text-zinc-550 font-bold tracking-wider uppercase select-none print:hidden">
            BẢN QUYỀN THUỘC VỀ NGUYỄN VĂN HỮU_NGÂN SƠN
          </footer>
        </div>

      </div>
    </div>
  );
}
