
import React, { useState, useEffect, useRef } from 'react';
import { getSettings } from '../services/storageService';
import { apiCall } from '../services/apiService';
import { SystemSettings } from '../types';
import { formatNumberString, deformatNumberString, getCurrentShamsiDate, jalaliToGregorian } from '../constants';
import { BrainCircuit, Calendar, Calculator, Building2, CheckCircle2, AlertTriangle, Loader2, Server, FileText, Wifi, RefreshCw, FileType2 } from 'lucide-react';

const SmartPaymentAnalysis: React.FC = () => {
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [amount, setAmount] = useState('');
    const [company, setCompany] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(getCurrentShamsiDate());
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    
    // Progress State
    const [progress, setProgress] = useState(0);
    const [loadingStep, setLoadingStep] = useState('');
    const progressInterval = useRef<any>(null);

    useEffect(() => {
        getSettings().then(setSettings);
        return () => clearInterval(progressInterval.current);
    }, []);

    const simulateProgress = () => {
        setProgress(0);
        setLoadingStep('در حال برقراری ارتباط با سرور...');
        
        let current = 0;
        progressInterval.current = setInterval(() => {
            current += Math.floor(Math.random() * 5) + 1;
            if (current > 95) current = 95; // Wait for real response
            
            if (current > 10 && current < 40) setLoadingStep('ارسال داده‌ها به موتور هوشمند...');
            if (current > 40 && current < 70) setLoadingStep('بررسی سوابق و نقدینگی...');
            if (current > 70 && current < 90) setLoadingStep('تحلیل الگوهای پرداخت...');
            if (current > 90) setLoadingStep('نهایی‌سازی پیشنهاد...');
            
            setProgress(current);
        }, 150);
    };

    const handleReset = () => {
        setAmount('');
        setCompany('');
        setDescription('');
        setDate(getCurrentShamsiDate());
        setAnalysisResult(null);
        setLoading(false);
        setProgress(0);
    };

    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setAnalysisResult(null);
        simulateProgress();

        // Convert Shamsi to ISO
        const gDate = jalaliToGregorian(date.year, date.month, date.day);
        const isoDate = gDate.toISOString().split('T')[0];

        try {
            const result = await apiCall<any>('/analyze-payment', 'POST', {
                amount: deformatNumberString(amount),
                date: isoDate,
                company,
                description
            });
            
            // Complete Progress
            clearInterval(progressInterval.current);
            setProgress(100);
            setLoadingStep('تکمیل شد.');
            
            setTimeout(() => {
                setAnalysisResult(result);
                setLoading(false);
            }, 500);
            
        } catch (error) {
            clearInterval(progressInterval.current);
            setProgress(0);
            alert('خطا در تحلیل. لطفا اتصال اینترنت را بررسی کنید.');
            setLoading(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score < 50) return 'text-red-600 bg-red-100';
        if (score < 75) return 'text-amber-600 bg-amber-100';
        return 'text-green-600 bg-green-100';
    };

    const years = Array.from({ length: 11 }, (_, i) => 1400 + i);
    const months = [ 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' ];
    const days = Array.from({ length: 31 }, (_, i) => i + 1);

    return (
        <div className="p-6 md:p-10 max-w-4xl mx-auto animate-fade-in">
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center p-4 bg-indigo-100 text-indigo-600 rounded-full mb-4 shadow-lg shadow-indigo-200">
                    <BrainCircuit size={40} />
                </div>
                <h2 className="text-3xl font-black text-gray-800 mb-2">دستیار هوشمند پرداخت</h2>
                <p className="text-gray-500">تاریخ، محل پرداخت و مبلغ را وارد کنید تا بهترین زمان پرداخت را پیشنهاد دهیم.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Form */}
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 h-fit">
                    <form onSubmit={handleAnalyze} className="space-y-6">
                        
                        {/* 1. Date Input */}
                        <div className="relative">
                            <span className="absolute -right-2 -top-2 w-6 h-6 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs font-bold shadow-md ring-2 ring-white">1</span>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <Calendar size={18} className="text-blue-500"/> تاریخ سررسید / پرداخت
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <select className="border rounded-xl p-2 bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-all" value={date.day} onChange={e => setDate({...date, day: Number(e.target.value)})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select>
                                <select className="border rounded-xl p-2 bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-all" value={date.month} onChange={e => setDate({...date, month: Number(e.target.value)})}>{months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}</select>
                                <select className="border rounded-xl p-2 bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-all" value={date.year} onChange={e => setDate({...date, year: Number(e.target.value)})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
                            </div>
                        </div>

                        {/* 2. Company (Place) Input */}
                        <div className="relative">
                            <span className="absolute -right-2 -top-2 w-6 h-6 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs font-bold shadow-md ring-2 ring-white">2</span>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <Building2 size={18} className="text-blue-500"/> محل پرداخت / شرکت
                            </label>
                            <select 
                                required 
                                className="w-full border rounded-xl p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                                value={company}
                                onChange={e => setCompany(e.target.value)}
                            >
                                <option value="">انتخاب کنید...</option>
                                {settings?.companies?.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                                <option value="سایر">سایر</option>
                            </select>
                        </div>

                        {/* 3. Amount Input */}
                        <div className="relative">
                            <span className="absolute -right-2 -top-2 w-6 h-6 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs font-bold shadow-md ring-2 ring-white">3</span>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <Calculator size={18} className="text-blue-500"/> مبلغ (ریال)
                            </label>
                            <input 
                                required
                                type="text" 
                                className="w-full border rounded-xl p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all dir-ltr text-left font-mono font-bold text-lg"
                                value={amount}
                                onChange={e => setAmount(formatNumberString(deformatNumberString(e.target.value)))}
                                placeholder="0"
                            />
                        </div>

                        {/* 4. Description Input */}
                        <div className="relative">
                            <span className="absolute -right-2 -top-2 w-6 h-6 flex items-center justify-center bg-blue-600 text-white rounded-full text-xs font-bold shadow-md ring-2 ring-white">4</span>
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                <FileType2 size={18} className="text-blue-500"/> بابت (شرح پرداخت)
                            </label>
                            <input 
                                type="text" 
                                className="w-full border rounded-xl p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition-all"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="مثال: خرید مواد اولیه / تنخواه‌گردان..."
                            />
                        </div>

                        <div className="flex gap-2">
                            <button 
                                type="button" 
                                onClick={handleReset}
                                disabled={loading}
                                className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-red-500 transition-colors"
                                title="پاک کردن فرم"
                            >
                                <RefreshCw size={20} />
                            </button>
                            <button 
                                type="submit" 
                                disabled={loading || !company || !amount}
                                className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-600/30 hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                            >
                                {loading ? <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full"></div> : <><BrainCircuit/> تحلیل و پیشنهاد</>}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Result Area */}
                <div className="flex flex-col justify-center min-h-[300px]">
                    {loading && (
                        <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 w-full animate-fade-in text-center">
                            <div className="flex justify-center mb-6">
                                <div className="relative">
                                    <div className="w-24 h-24 border-4 border-indigo-100 rounded-full"></div>
                                    <div className="w-24 h-24 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                                    <div className="absolute top-0 left-0 w-24 h-24 flex items-center justify-center font-bold text-indigo-700 text-xl">
                                        {progress}%
                                    </div>
                                </div>
                            </div>
                            
                            <h3 className="text-lg font-bold text-gray-800 mb-2">{loadingStep}</h3>
                            
                            <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4 overflow-hidden">
                                <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-400 mt-4">
                                <div className={`flex flex-col items-center ${progress > 10 ? 'text-green-600' : ''}`}>
                                    <Wifi size={16} className="mb-1"/> اتصال
                                </div>
                                <div className={`flex flex-col items-center ${progress > 40 ? 'text-green-600' : ''}`}>
                                    <Server size={16} className="mb-1"/> پردازش
                                </div>
                                <div className={`flex flex-col items-center ${progress > 80 ? 'text-green-600' : ''}`}>
                                    <FileText size={16} className="mb-1"/> نتیجه
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && !analysisResult && (
                        <div className="text-center py-10 opacity-40">
                            <div className="text-6xl mb-4 grayscale">📊</div>
                            <p>منتظر ورود اطلاعات برای تحلیل...</p>
                        </div>
                    )}

                    {analysisResult && !loading && (
                        <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 animate-fade-in-up">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-gray-500">نتیجه تحلیل</h3>
                                <span className={`px-4 py-1 rounded-full text-sm font-bold ${getScoreColor(analysisResult.score)}`}>
                                    امتیاز: {analysisResult.score}/100
                                </span>
                            </div>

                            <div className="text-center mb-8">
                                <div className={`text-3xl font-black mb-2 ${analysisResult.score > 70 ? 'text-green-600' : analysisResult.score < 50 ? 'text-red-600' : 'text-amber-600'}`}>
                                    {analysisResult.recommendation}
                                </div>
                                <p className="text-gray-400 text-sm">
                                    {analysisResult.isOffline ? 'بر اساس قوانین پیش‌فرض (آفلاین)' : 'بر اساس تحلیل هوشمند Gemini'}
                                </p>
                            </div>

                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <h4 className="font-bold text-sm text-gray-700 mb-2">دلایل و پیشنهادات:</h4>
                                {analysisResult.reasons.map((r: string, idx: number) => (
                                    <div key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                                        {analysisResult.score > 50 ? <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0"/> : <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0"/>}
                                        <span>{r}</span>
                                    </div>
                                ))}
                                {analysisResult.reasons.length === 0 && <p className="text-sm text-green-600">همه چیز برای پرداخت مناسب به نظر می‌رسد.</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmartPaymentAnalysis;
