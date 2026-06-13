import React, { useState } from 'react';
import { useTournamentStore } from '../store';
import { Account } from '../types';
import { 
  UserPlus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  ShieldAlert, 
  Key, 
  FolderLock, 
  Plus, 
  Users, 
  Info, 
  Trophy,
  RefreshCw,
  Search
} from 'lucide-react';

export default function AccountManager() {
  const { 
    accounts, 
    addAccount2, 
    updateAccount2, 
    deleteAccount2, 
    initSupabase, 
    supabaseConnected 
  } = useTournamentStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Edit State
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editTournamentName, setEditTournamentName] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedDisplay = displayName.trim();
    const trimmedTournament = tournamentName.trim();

    if (!trimmedUsername || !trimmedPassword || !trimmedDisplay) {
      setErrorMsg('Vui lòng điền đầy đủ tên đăng nhập, mật khẩu và tên đơn vị.');
      return;
    }

    if (trimmedUsername === 'huunsbk' || trimmedUsername === 'admin123') {
      setErrorMsg('Tên đăng nhập này là tài khoản hệ thống chuyên dụng, không thể đặt trùng.');
      return;
    }

    const exists = accounts.some(acc => acc.username.toLowerCase() === trimmedUsername);
    if (exists) {
      setErrorMsg(`Tài khoản "${trimmedUsername}" đã tồn tại trên hệ thống.`);
      return;
    }

    setIsSyncing(true);
    const success = await addAccount2({
      username: trimmedUsername,
      password: trimmedPassword,
      displayName: trimmedDisplay,
      tournamentName: trimmedTournament || `Giải Pickleball thuộc ${trimmedDisplay}`
    });

    setIsSyncing(false);
    if (success) {
      setSuccessMsg(`Đã tạo thành công tài khoản cấp 2 cho đơn vị "${trimmedDisplay}".`);
      setUsername('');
      setPassword('');
      setDisplayName('');
      setTournamentName('');
    } else {
      setErrorMsg('Đã có lỗi xảy ra khi lưu tài khoản vào cơ sở dữ liệu.');
    }
  };

  const handleStartEdit = (acc: Account) => {
    setEditingUsername(acc.username);
    setEditPassword(acc.password);
    setEditDisplayName(acc.displayName);
    setEditTournamentName(acc.tournamentName);
  };

  const handleSaveEdit = async () => {
    if (!editingUsername) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (!editPassword.trim() || !editDisplayName.trim()) {
      setErrorMsg('Tên đơn vị và mật khẩu không được để trống.');
      return;
    }

    setIsSyncing(true);
    const success = await updateAccount2({
      username: editingUsername,
      password: editPassword.trim(),
      displayName: editDisplayName.trim(),
      tournamentName: editTournamentName.trim() || `Giải Pickleball thuộc ${editDisplayName.trim()}`
    });

    setIsSyncing(false);
    if (success) {
      setSuccessMsg(`Cập nhật tài khoản "${editingUsername}" thành công!`);
      setEditingUsername(null);
    } else {
      setErrorMsg('Lỗi cập nhật cấu hình tài khoản.');
    }
  };

  const handleDelete = async (userToDelete: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản "${userToDelete}"? Việc này sẽ thu hồi quyền truy cập của đơn vị này.`)) {
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setIsSyncing(true);

    const success = await deleteAccount2(userToDelete);
    setIsSyncing(false);

    if (success) {
      setSuccessMsg(`Đã xóa tài khoản "${userToDelete}" thành công.`);
    } else {
      setErrorMsg('Lỗi khi xóa tài khoản khỏi cơ sở dữ liệu.');
    }
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    await initSupabase();
    setIsSyncing(false);
    setSuccessMsg('Đã đồng bộ và làm mới danh sách tài khoản từ đám mây.');
  };

  const filteredAccounts = accounts.filter(acc => 
    acc.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.tournamentName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 w-full" id="account-manager-page">
      
      {/* Banner Tiêu Đề */}
      <div className="bg-gradient-to-r from-slate-900 to-[#1e293b] text-white p-5 rounded-2xl border border-slate-800 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-inner shrink-0">
            <FolderLock size={22} className="stroke-[2]" />
          </div>
          <div>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-indigo-500/30">
              Quản Trị Tối Cao - Cấp 1 (huunsbk)
            </span>
            <h1 className="text-lg font-black tracking-tight mt-1">CẤP & PHÂN QUYỀN TÀI KHOẢN ĐƠN VỊ</h1>
          </div>
        </div>
        
        <button
          onClick={handleSyncData}
          disabled={isSyncing}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700/60 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer ml-auto md:ml-0"
        >
          <RefreshCw size={13} className={isSyncing ? "animate-spin text-blue-400" : "text-slate-400"} />
          Làm mới
        </button>
      </div>

      {/* Thông Báo Trực Quan */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-shake" id="account-error-alert">
          <ShieldAlert size={14} className="text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in" id="account-success-alert">
          <Check size={14} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* Cột Trái: Tạo tài khoản Cấp 2 */}
        <div className="xl:col-span-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-md p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <UserPlus size={16} className="text-blue-600 dark:text-blue-400 stroke-[2.5]" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">Cấp Tài Khoản Mới</h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-3.5 text-xs text-zinc-600 dark:text-zinc-300">
            <div>
              <label className="block font-bold mb-1 text-zinc-700 dark:text-zinc-300">Tên Đăng Nhập (Cấp 2) <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="ví dụ: nganson_a, clb_pickleball"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1.5 focus:ring-blue-600 focus:bg-white"
                required
              />
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Sử dụng chữ thường không dấu, không khoảng cách.</p>
            </div>

            <div>
              <label className="block font-bold mb-1 text-zinc-700 dark:text-zinc-300">Mật khẩu Đăng Nhập <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu đơn giản hoặc mã số"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  required
                />
                <Key size={13} className="absolute left-3 top-3 text-zinc-400" />
              </div>
            </div>

            <div>
              <label className="block font-bold mb-1 text-zinc-700 dark:text-zinc-300">Tên Đơn Vị / Câu Lạc Bộ <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="ví dụ: Đơn Vị Ngân Sơn A"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-bold mb-1 text-zinc-700 dark:text-zinc-300">Tên Giải Đấu Riêng (Tùy chọn)</label>
              <input
                type="text"
                value={tournamentName}
                onChange={e => setTournamentName(e.target.value)}
                placeholder="Hệ thống tự động tạo nếu bỏ trống"
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSyncing}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl mt-2 cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md border border-blue-700"
            >
              <Plus size={14} className="stroke-[2.5]" />
              Kích Hoạt Tài Khoản Cấp 2
            </button>
          </form>

          {/* Alert Hỗ Trợ Đơn Vị */}
          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/50 dark:border-indigo-900/20 rounded-xl p-3 text-[11px] text-indigo-700 dark:text-indigo-300 flex gap-2">
            <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý đồng bộ:</strong> Mỗi tài khoản cấp 2 sẽ tự động có một phân vùng giải đấu và cơ sở dữ liệu riêng, hoàn toàn không dính dáng hay ảnh hưởng tới các đơn vị và tài khoản khác.
            </div>
          </div>
        </div>

        {/* Cột Phải: Danh Sách Tài Khoản */}
        <div className="xl:col-span-8 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-md p-5 space-y-4">
          
          {/* Thanh Công Cụ & Tìm Kiếm */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-zinc-500 stroke-[2.5]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                Danh Sách Tài Khoản ({filteredAccounts.length})
              </h2>
            </div>

            {/* Tìm Kiếm */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm tên đăng nhập, đơn vị..."
                className="w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-xs border border-zinc-200 dark:border-zinc-800 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search size={12} className="absolute left-2.5 top-2.5 text-zinc-400" />
            </div>
          </div>

          {/* Bảng Dữ Liệu */}
          <div className="overflow-x-auto">
            {filteredAccounts.length === 0 ? (
              <div className="text-center py-10 space-y-2 text-zinc-400 dark:text-zinc-650">
                <Users size={40} className="mx-auto text-zinc-300 dark:text-zinc-750 stroke-[1.5]" />
                <p className="text-xs">Chưa có tài khoản cấp 2 nào được đăng ký.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-150 dark:border-zinc-800 text-zinc-400 font-bold">
                    <th className="py-2.5 px-3">Tài khoản</th>
                    <th className="py-2.5 px-3">Mật khẩu</th>
                    <th className="py-2.5 px-3">Tên đơn vị quản lý</th>
                    <th className="py-2.5 px-3">Giải đấu liên kết</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-150 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-350">
                  {filteredAccounts.map(acc => {
                    const isEditing = editingUsername === acc.username;

                    return (
                      <tr 
                        key={acc.username} 
                        className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-800/10 transition-colors ${isEditing ? 'bg-amber-50/30 dark:bg-amber-950/5' : ''}`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-zinc-900 dark:text-zinc-200">
                          @{acc.username}
                        </td>
                        
                        <td className="py-2 px-3">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editPassword}
                              onChange={e => setEditPassword(e.target.value)}
                              className="bg-zinc-100 dark:bg-zinc-950 text-xs border border-zinc-300 dark:border-zinc-700 font-mono rounded px-2 py-1 w-28 focus:outline-none"
                            />
                          ) : (
                            <span className="font-mono bg-zinc-150/50 dark:bg-zinc-850 px-2 py-0.5 rounded text-zinc-600 dark:text-zinc-400 font-semibold">{acc.password}</span>
                          )}
                        </td>

                        <td className="py-2 px-3 font-semibold">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDisplayName}
                              onChange={e => setEditDisplayName(e.target.value)}
                              className="bg-zinc-100 dark:bg-zinc-950 text-xs border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full focus:outline-none"
                            />
                          ) : (
                            acc.displayName
                          )}
                        </td>

                        <td className="py-2 px-3 text-zinc-500 dark:text-zinc-450 italic">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editTournamentName}
                              onChange={e => setEditTournamentName(e.target.value)}
                              className="bg-zinc-100 dark:bg-zinc-950 text-xs border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 w-full focus:outline-none"
                            />
                          ) : (
                            acc.tournamentName
                          )}
                        </td>

                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={handleSaveEdit}
                                  className="p-1 px-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all flex items-center gap-1 cursor-pointer"
                                  title="Lưu lại"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={() => setEditingUsername(null)}
                                  className="p-1 px-1.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-all flex items-center gap-1 cursor-pointer"
                                  title="Hủy"
                                >
                                  <X size={12} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartEdit(acc)}
                                  className="p-1.5 rounded-lg bg-zinc-100 hover:bg-blue-50 dark:bg-zinc-800/60 dark:hover:bg-blue-950/20 text-zinc-500 hover:text-blue-600 dark:text-zinc-400 transition-all cursor-pointer"
                                  title="Sửa tài khoản"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDelete(acc.username)}
                                  className="p-1.5 rounded-lg bg-zinc-100 hover:bg-red-50 dark:bg-zinc-800/60 dark:hover:bg-red-950/20 text-zinc-500 hover:text-red-600 dark:text-zinc-400 transition-all cursor-pointer"
                                  title="Xóa tài khoản"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Disclaimer bảo mật */}
          <div className="text-[10px] text-zinc-400 dark:text-zinc-550 border-t border-zinc-100 dark:border-zinc-800 pt-3 flex items-center gap-1">
            <span>● Toàn bộ dữ liệu của các tài khoản đều được phân cách bằng công nghệ Tenant-ID ở cấp độ Ứng Dụng & Cơ Sở Dữ Liệu Supabase.</span>
          </div>
        </div>

      </div>

    </div>
  );
}
