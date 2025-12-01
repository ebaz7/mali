
import React, { useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';
import { getUsers, saveUser, updateUser, deleteUser } from '../services/authService';
import { UserPlus, Trash2, Shield, User as UserIcon, Download, CloudOff, Pencil, X, Save, Container } from 'lucide-react';
import { generateUUID } from '../constants';
import { apiCall } from '../services/apiService';

const ManageUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ username: '', password: '', fullName: '', role: UserRole.USER, canManageTrade: false });
  const loadUsers = async () => { const data = await getUsers(); setUsers(data); };
  useEffect(() => { loadUsers(); }, []);
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (editingId) { const updatedUser: User = { id: editingId, ...formData }; await updateUser(updatedUser); setEditingId(null); } else { const user: User = { id: generateUUID(), ...formData }; await saveUser(user); } await loadUsers(); setFormData({ username: '', password: '', fullName: '', role: UserRole.USER, canManageTrade: false }); };
  const handleEditClick = (user: User) => { setEditingId(user.id); setFormData({ username: user.username, password: user.password, fullName: user.fullName, role: user.role, canManageTrade: user.canManageTrade || false }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const handleCancelEdit = () => { setEditingId(null); setFormData({ username: '', password: '', fullName: '', role: UserRole.USER, canManageTrade: false }); };
  const handleDeleteUser = async (id: string) => { if (window.confirm('آیا از حذف این کاربر اطمینان دارید؟')) { await deleteUser(id); await loadUsers(); } };
  const handleBackup = async () => { try { const backupData = await apiCall<any>('/backup'); const jsonString = JSON.stringify(backupData, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup_payment_system_${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { alert('خطا در دریافت فایل پشتیبان'); } };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${editingId ? 'bg-amber-100 text-amber-600' : 'bg-purple-100 text-purple-600'}`}>{editingId ? <Pencil size={24} /> : <UserPlus size={24} />}</div><h2 className="text-xl font-bold text-gray-800">{editingId ? 'ویرایش اطلاعات کاربر' : 'تعریف کاربر جدید'}</h2></div><button onClick={handleBackup} className="flex items-center gap-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg transition-colors"><Download size={16} />دانلود نسخه پشتیبان</button></div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="space-y-1"><label className="text-sm text-gray-600">نام و نام خانوادگی</label><input required type="text" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="مثال: محمد احمدی" /></div>
          <div className="space-y-1"><label className="text-sm text-gray-600">نام کاربری</label><input required type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm text-left dir-ltr" placeholder="username" /></div>
          <div className="space-y-1"><label className="text-sm text-gray-600">رمز عبور</label><input required type="text" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm text-left dir-ltr" placeholder="password" /></div>
          <div className="space-y-1"><label className="text-sm text-gray-600">نقش کاربری</label><select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})} className="w-full border rounded-lg px-3 py-2 text-sm bg-white"><option value={UserRole.USER}>کاربر عادی (فقط ثبت)</option><option value={UserRole.MANAGER}>مدیر (تایید درخواست)</option><option value={UserRole.FINANCIAL}>مدیر مالی</option><option value={UserRole.CEO}>مدیر عامل</option><option value={UserRole.ADMIN}>مدیر سیستم (دسترسی کامل)</option></select></div>
          <div className="flex flex-col gap-2"><label className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-2 py-1.5 rounded cursor-pointer border border-gray-200"><input type="checkbox" checked={formData.canManageTrade} onChange={e => setFormData({...formData, canManageTrade: e.target.checked})} className="w-4 h-4 text-blue-600" /><span>دسترسی اختصاصی بازرگانی</span></label><div className="flex gap-2">{editingId && (<button type="button" onClick={handleCancelEdit} className="bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 px-3 rounded-lg text-sm font-medium transition-colors h-[38px] flex items-center justify-center" title="انصراف"><X size={18} /></button>)}<button type="submit" className={`${editingId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-purple-600 hover:bg-purple-700'} text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors h-[38px] flex-1 flex items-center justify-center gap-1`}>{editingId ? <><Save size={16}/> ذخیره</> : 'افزودن'}</button></div></div>
        </form>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100"><h2 className="text-lg font-bold text-gray-800">لیست کاربران سیستم</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right"><thead className="bg-gray-5 text-gray-600"><tr><th className="px-6 py-3">نام و نام خانوادگی</th><th className="px-6 py-3">نام کاربری</th><th className="px-6 py-3">نقش</th><th className="px-6 py-3">دسترسی‌ها</th><th className="px-6 py-3 text-center">عملیات</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{users.map((user) => (<tr key={user.id} className={`hover:bg-gray-50 transition-colors ${editingId === user.id ? 'bg-amber-50' : ''}`}><td className="px-6 py-4 flex items-center gap-2"><div className="bg-gray-100 p-1.5 rounded-full text-gray-500"><UserIcon size={16} /></div>{user.fullName}</td><td className="px-6 py-4 font-mono text-gray-500">{user.username}</td><td className="px-6 py-4"><span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${user.role === UserRole.ADMIN ? 'bg-purple-50 text-purple-700 border-purple-200' : user.role === UserRole.CEO ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : user.role === UserRole.MANAGER ? 'bg-blue-50 text-blue-700 border-blue-200' : user.role === UserRole.FINANCIAL ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>{user.role === UserRole.ADMIN && <Shield size={10} />}{user.role === UserRole.ADMIN ? 'مدیر سیستم' : user.role === UserRole.CEO ? 'مدیر عامل' : user.role === UserRole.FINANCIAL ? 'مدیر مالی' : user.role === UserRole.MANAGER ? 'مدیر داخلی' : 'کاربر عادی'}</span></td><td className="px-6 py-4">{user.canManageTrade && (<span className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded w-fit"><Container size={10} /> بازرگانی</span>)}</td><td className="px-6 py-4 text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => handleEditClick(user)} className="text-amber-500 hover:text-amber-700 p-1 hover:bg-amber-50 rounded transition-colors" title="ویرایش / تغییر رمز"><Pencil size={16} /></button>{user.username !== 'admin' && (<button onClick={() => handleDeleteUser(user.id)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors" title="حذف کاربر"><Trash2 size={16} /></button>)}</div></td></tr>))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default ManageUsers;
