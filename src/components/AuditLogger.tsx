/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTournamentStore } from '../store';
import { FileText, Trash2, Search, Activity, HelpCircle, Check, AlertCircle } from 'lucide-react';

export default function AuditLogger() {
  const { logs, clearLogs, addLog } = useTournamentStore();
  const [query, setQuery] = useState('');
  
  // Custom confirmation modal state to bypass native confirm() dialog blocking
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearConfirmSubmit = () => {
    clearLogs();
    addLog('Nhật Ký', 'Dọn dẹp nhật ký lịch sử vận hành thành công.');
    setShowClearConfirm(false);
  };

  const filteredLogs = logs.filter(
    (log) =>
      log.action.toLowerCase().includes(query.toLowerCase()) ||
      log.details.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-8" id="audit-logger-view">
      
      {/* Thẻ mô tả cấu hình */}
      <div className="bg-white dark:bg-zinc-900 p-7 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-6 shadow-md">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h3 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 uppercase tracking-tight">
              <FileText size={22} className="text-blue-600 stroke-[2.5]" />
              Nhật Ký Vận Hành Trọng Tài Chuyên Nghiệp
            </h3>
            <p className="text-xs text-zinc-400 font-semibold mt-1">
              Ghi nhận tự động thời gian thực mọi biến động điểm số, xếp bảng, bốc thăm hạt giống của ban tổ chức.
            </p>
          </div>

          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-4.5 py-3 bg-red-50 hover:bg-red-100 dark:bg-red-955/40 text-red-600 dark:text-red-400 font-extrabold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer border border-red-200/50 uppercase tracking-wider transition-all"
              id="btn-clear-audit-logs"
            >
              <Trash2 size={15} /> Xóa Nhật Ký
            </button>
          </div>
        </div>

        {/* Thanh tìm kiếm bự */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-zinc-400">
            <Search size={18} className="text-zinc-400 stroke-[2.5]" />
          </span>
          <input
            type="text"
            placeholder="Tìm nhanh hành động, cặp đấu, tỉ số, hoặc thông số kỹ thuật..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-5 py-3 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-semibold text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        {/* Bản logs timeline */}
        {filteredLogs.length === 0 ? (
          <div className="py-20 text-center text-zinc-400 text-sm border border-dashed border-zinc-200 dark:border-zinc-805 bg-zinc-50/50 dark:bg-zinc-955/20 rounded-2xl space-y-3">
            <Activity size={44} className="mx-auto text-zinc-300 dark:text-zinc-700 animate-pulse" />
            <p className="font-extrabold text-zinc-700 dark:text-zinc-300">Không tìm thấy bản ghi nhật ký nào khớp.</p>
            <p className="text-xs text-zinc-500 font-semibold">Mọi hành vi số hóa sẽ được tự động lưu trữ tại đây khi bạn thao tác ứng dụng.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1" id="audit-logs-list">
            {filteredLogs.slice().reverse().map((log, index) => (
              <div
                key={index}
                className="p-4.5 bg-zinc-55 dark:bg-zinc-955 rounded-xl border border-zinc-100 dark:border-zinc-850 hover:bg-zinc-100/50 dark:hover:bg-zinc-805/30 transition-all flex items-start gap-4"
                id={`audit-log-item-${index}`}
              >
                <div className="px-3 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-black text-xs rounded-lg shrink-0 select-none border border-blue-100/50 dark:border-blue-900/40 uppercase">
                  {log.action}
                </div>
                
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-black text-zinc-800 dark:text-zinc-205 leading-relaxed">
                    {log.details}
                  </p>
                  <p className="text-[11px] text-zinc-400 font-mono font-semibold">
                    Mốc thời gian ghi nhận: {log.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* POPUP XÁC NHẬN XÓA NHẬT KÝ CUSTOM CHẠY ĐỘC LẬP iFRAME */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-51 animate-fade-in" id="clear-audit-logs-popup">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6.5 shadow-2xl space-y-4">
            
            <div className="flex items-center gap-3.5 text-red-600">
              <div className="p-3 bg-red-50 dark:bg-red-955/40 rounded-2xl">
                <Trash2 size={24} className="stroke-[2.5]" />
              </div>
              <div>
                <h4 className="text-lg font-black text-zinc-900 dark:text-zinc-105 leading-tight">Xóa Lịch Sử Nhật Ký</h4>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Cảnh báo hệ thống</p>
              </div>
            </div>

            <p className="text-sm font-semibold text-zinc-650 dark:text-zinc-400 leading-relaxed pt-2">
              Bạn có chắc chắn muốn <strong className="text-red-600 dark:text-red-400 font-black uppercase">XÓA SẠCH HOÀN TOÀN</strong> nhật ký vận hành biên ghi chép không?
              Thao tác này đồng nghĩa lược sử dọn sân sẽ mất và không thể phục hồi lại.
            </p>

            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-5 py-2.5 text-xs font-bold text-zinc-600 hover:text-zinc-850 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-805 dark:text-zinc-300 rounded-xl cursor-pointer"
              >
                Hủy bỏ
              </button>
              
              <button
                onClick={handleClearConfirmSubmit}
                className="px-6 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-550 rounded-xl shadow-md cursor-pointer uppercase tracking-wider"
                id="btn-confirm-delete-logs"
              >
                Xác Nhận Xóa Nhật Ký
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
