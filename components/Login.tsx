
import React, { useState, useEffect } from 'react';
import { login } from '../services/authService';
import { User } from '../types';
import { LogIn, KeyRound, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUsername = localStorage.getItem('saved_username');
    if (savedUsername) setUsername(savedUsername);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const user = await login(username, password);
    setLoading(false);
    if (user) {
      localStorage.setItem('saved_username', username);
      onLogin(user);
    } else {
      setError('نام کاربری یا رمز عبور اشتباه است.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-200">
        <div className="flex flex-col items-center mb-8"><div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-600/30"><KeyRound size={32} /></div><h1 className="text-2xl font-bold text-gray-800">ورود به سیستم مالی</h1><p className="text-gray-500 mt-2 text-sm">لطفا برای ادامه وارد شوید</p></div>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center border border-red-100">{error}</div>}
          <div className="space-y-2"><label className="text-sm font-medium text-gray-700 block">نام کاربری</label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-gray-50 focus:bg-white text-left dir-ltr" required /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-gray-700 block">رمز عبور</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-gray-50 focus:bg-white text-left dir-ltr" required /></div>
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-medium shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70">{loading ? <Loader2 className="animate-spin" /> : <LogIn size={20} />}ورود به حساب کاربری</button>
        </form>
      </div>
    </div>
  );
};
export default Login;
