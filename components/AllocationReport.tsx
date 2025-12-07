
import React, { useState, useEffect } from 'react';
import { TradeRecord, TradeStage } from '../types';
import { formatCurrency, formatNumberString, deformatNumberString, parsePersianDate } from '../constants';
import { FileSpreadsheet, Printer, FileDown, Share2, Loader2, Search, Filter, Settings, X, RefreshCw } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface AllocationReportProps {
    records: TradeRecord[];
    onUpdateRecord: (record: TradeRecord, updates: Partial<TradeRecord>) => Promise<void>;
    settings: any;
}

interface ExchangeRates {
    eurToUsd: number;
    aedToUsd: number;
    cnyToUsd: number;
    tryToUsd: number;
    rialRate: number;
}

const STORAGE_KEY_RATES = 'allocation_report_rates_v1';

const AllocationReport: React.FC<AllocationReportProps> = ({ records, onUpdateRecord, settings }) => {
    // -- State for Rates (Persisted) --
    const [rates, setRates] = useState<ExchangeRates>({
        eurToUsd: 1.08,
        aedToUsd: 0.272, // Approx 1/3.67
        cnyToUsd: 0.14,
        tryToUsd: 0.03,
        rialRate: 500000
    });

    // -- State for Filters & Search --
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [showRates, setShowRates] = useState(false);
    
    // Advanced Filters
    const [filters, setFilters] = useState({
        company: '',
        status: 'all', // all, allocated, queue
        priority: 'all', // all, high, normal
        currencyType: 'all', // all, Type1, Type2, unset
        origin: 'all', // all, Bank, Nima, Export, Free
        bank: ''
    });

    const [sendingReport, setSendingReport] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // -- Effects --

    // Load Rates on Mount
    useEffect(() => {
        try {
            const savedRates = localStorage.getItem(STORAGE_KEY_RATES);
            if (savedRates) {
                setRates(JSON.parse(savedRates));
            }
        } catch (e) {
            console.error("Failed to load rates", e);
        }
    }, []);

    // Save Rates on Change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_RATES, JSON.stringify(rates));
    }, [rates]);

    // -- Helper Data --
    const availableCompanies = Array.from(new Set(records.map(r => r.company).filter(Boolean)));
    const availableBanks = Array.from(new Set(records.map(r => r.operatingBank).filter(Boolean)));

    // -- Filtering Logic --
    const filteredRecords = records.filter(r => {
        if (r.status === 'Completed') return false; // Active only

        // 1. Global Search (Check ALL text fields)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matches = 
                r.fileNumber.toLowerCase().includes(term) ||
                (r.goodsName && r.goodsName.toLowerCase().includes(term)) ||
                (r.sellerName && r.sellerName.toLowerCase().includes(term)) ||
                (r.registrationNumber && r.registrationNumber.toLowerCase().includes(term)) ||
                (r.company && r.company.toLowerCase().includes(term)) ||
                (r.operatingBank && r.operatingBank.toLowerCase().includes(term));
            
            if (!matches) return false;
        }

        // 2. Specific Filters
        if (filters.company && r.company !== filters.company) return false;
        if (filters.bank && r.operatingBank !== filters.bank) return false;
        
        // Priority Filter
        if (filters.priority === 'high' && !r.isPriority) return false;
        if (filters.priority === 'normal' && r.isPriority) return false;

        // Currency Rank Filter (Type1/Type2)
        if (filters.currencyType !== 'all') {
            if (filters.currencyType === 'unset' && r.allocationCurrencyRank) return false;
            if (filters.currencyType !== 'unset' && r.allocationCurrencyRank !== filters.currencyType) return false;
        }

        // Origin Filter
        if (filters.origin !== 'all') {
            if (r.currencyAllocationType !== filters.origin) return false;
        }

        // Status Filter (Allocated vs Queue)
        const isAllocated = r.stages[TradeStage.ALLOCATION_APPROVED]?.isCompleted;
        if (filters.status === 'allocated' && !isAllocated) return false;
        if (filters.status === 'queue' && isAllocated) return false;

        return true;
    });

    // -- Calculation Logic --
    const processedRecords = filteredRecords.map(r => {
        const stageQ = r.stages[TradeStage.ALLOCATION_QUEUE];
        const stageA = r.stages[TradeStage.ALLOCATION_APPROVED];
        
        const isAllocated = stageA?.isCompleted;

        // Amount
        let amount = stageQ?.costCurrency;
        if (!amount || amount === 0) {
            amount = r.items.reduce((sum, item) => sum + item.totalPrice, 0);
        }

        // Convert to USD based on Main Currency
        const currency = r.mainCurrency || 'EUR';
        let amountInUSD = 0;
        
        switch (currency) {
            case 'USD': amountInUSD = amount; break;
            case 'EUR': amountInUSD = amount * rates.eurToUsd; break;
            case 'AED': amountInUSD = amount * rates.aedToUsd; break;
            case 'CNY': amountInUSD = amount * rates.cnyToUsd; break;
            case 'TRY': amountInUSD = amount * rates.tryToUsd; break;
            default: amountInUSD = amount; // Fallback 1:1 if unknown
        }

        const rialEquiv = amountInUSD * rates.rialRate;

        // Expiry
        let remainingDays: string | number = '-';
        if (isAllocated && stageA?.allocationDate) {
            const allocDate = parsePersianDate(stageA.allocationDate);
            if (allocDate) {
                const expiryDate = new Date(allocDate);
                expiryDate.setDate(expiryDate.getDate() + 30);
                const now = new Date();
                const diffTime = expiryDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                remainingDays = diffDays;
            }
        }

        return {
            ...r,
            amount,
            amountInUSD,
            rialEquiv,
            isAllocated,
            remainingDays,
            stageQ,
            stageA
        };
    });

    // -- Summary Calculation --
    const companySummary: Record<string, { allocated: number, queue: number }> = {};
    let totalAllocated = 0;
    let totalQueue = 0;

    processedRecords.forEach(r => {
        const companyName = r.company || 'نامشخص';
        if (!companySummary[companyName]) {
            companySummary[companyName] = { allocated: 0, queue: 0 };
        }
        if (r.isAllocated) {
            companySummary[companyName].allocated += r.amountInUSD;
            totalAllocated += r.amountInUSD;
        } else {
            companySummary[companyName].queue += r.amountInUSD;
            totalQueue += r.amountInUSD;
        }
    });

    const formatUSD = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // -- Handlers --
    const handlePrint = () => {
        const content = document.getElementById('allocation-report-table-print-area');
        if (!content) return;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        const styleSheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(el => el.outerHTML).join('');
        
        doc.open();
        doc.write(`
            <html dir="rtl" lang="fa">
            <head>
                <title>گزارش صف تخصیص</title>
                ${styleSheets}
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
                <style>
                    body { background: white !important; margin: 0 !important; padding: 20px !important; font-family: 'Vazirmatn', sans-serif !important; direction: rtl !important; overflow: visible !important; height: auto !important; }
                    body > * { display: block !important; visibility: visible !important; }
                    table { width: 100%; border-collapse: collapse; font-size: 10pt; } 
                    th, td { border: 1px solid #000; padding: 4px; text-align: center; } 
                    th { background-color: #1e3a8a !important; color: white !important; font-weight: bold; } 
                    .no-print { display: none !important; }
                    select { appearance: none; border: none; background: transparent; text-align: center; width: auto; font-family: inherit; color: black !important; }
                    @media print { @page { size: A4 landscape; margin: 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
                </style>
            </head>
            <body>
                <div style="width: 100%;">
                    <h2 style="text-align: center; margin-bottom: 20px; font-weight: bold;">گزارش صف تخصیص ارز</h2>
                    ${content.innerHTML}
                </div>
                <script>
                    window.onload = function() { setTimeout(function() { window.focus(); window.print(); }, 1000); };
                </script>
            </body>
            </html>
        `);
        doc.close();
        setTimeout(() => { if (document.body.contains(iframe)) { document.body.removeChild(iframe); } }, 60000);
    };

    const handleDownloadPDF = async () => {
        setIsGeneratingPdf(true);
        const element = document.getElementById('allocation-report-table-print-area');
        if (!element) { setIsGeneratingPdf(false); return; }
        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, {
                scale: 2, backgroundColor: '#ffffff', useCORS: true,
                onclone: (doc: any) => {
                    const el = doc.getElementById('allocation-report-table-print-area');
                    if (el) {
                        el.style.width = '1400px'; el.style.direction = 'rtl';
                        const selects = el.querySelectorAll('select');
                        selects.forEach((s: any) => {
                            const val = s.options[s.selectedIndex].text;
                            if (val !== 'انتخاب') { const span = doc.createElement('span'); span.innerText = val; s.parentNode.replaceChild(span, s); }
                        });
                    }
                }
            });
            const imgData = canvas.toDataURL('image/png');
            // @ts-ignore
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            pdf.addImage(imgData, 'PNG', 5, 5, 287, (canvas.height * 287) / canvas.width);
            pdf.save(`Allocation_Report_${new Date().toISOString().slice(0,10)}.pdf`);
        } catch (e) { console.error(e); alert("خطا در ایجاد PDF"); } finally { setIsGeneratingPdf(false); }
    };

    const handleExport = () => {
        const rows = [];
        const headers = ["ردیف", "پرونده / کالا", "شماره ثبت سفارش", "شرکت", "مبلغ ارزی", "معادل دلار ($)", "معادل ریالی", "زمان در صف", "زمان تخصیص", "مانده مهلت (روز)", "وضعیت", "بانک عامل", "اولویت", "نوع ارز"];
        rows.push(headers.join(","));
        const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;

        processedRecords.forEach((r, index) => {
            const row = [
                index + 1, escape(`${r.fileNumber} - ${r.goodsName}`), escape(r.registrationNumber), escape(r.company),
                escape(`${formatCurrency(r.amount)} ${r.mainCurrency}`), escape(formatUSD(r.amountInUSD)), escape(formatCurrency(r.rialEquiv)),
                escape(r.stageQ?.queueDate), escape(r.stageA?.allocationDate), escape(r.remainingDays),
                escape(r.isAllocated ? 'تخصیص یافته' : 'در صف'), escape(r.operatingBank),
                escape(r.isPriority ? 'بله' : 'خیر'), escape(r.allocationCurrencyRank === 'Type1' ? 'نوع اول' : r.allocationCurrencyRank === 'Type2' ? 'نوع دوم' : '')
            ];
            rows.push(row.join(","));
        });
        rows.push("");
        rows.push("خلاصه وضعیت,,,تخصیص یافته ($),در صف ($),مجموع ($)");
        Object.entries(companySummary).forEach(([comp, data]) => { rows.push(`,,,${escape(comp)},"${formatUSD(data.allocated)}","${formatUSD(data.queue)}","${formatUSD(data.allocated + data.queue)}"`); });
        rows.push(`,,,جمع کل,"${formatUSD(totalAllocated)}","${formatUSD(totalQueue)}","${formatUSD(totalAllocated + totalQueue)}"`);

        const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Allocation_Report_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleShareWhatsApp = async () => {
        if (!settings?.whatsappNumber) { alert('شماره واتساپ در تنظیمات وارد نشده است.'); return; }
        let target = prompt("شماره یا آیدی گروه را وارد کنید:", settings.whatsappNumber); if (!target) return;
        setSendingReport(true);
        const element = document.getElementById('allocation-report-table-print-area');
        if (!element) { setSendingReport(false); return; }
        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff', onclone: (doc: any) => { 
                const el = doc.getElementById('allocation-report-table-print-area'); 
                if (el) { el.style.width = '1400px'; el.style.direction = 'rtl'; const selects = el.querySelectorAll('select'); selects.forEach((s: any) => { const val = s.options[s.selectedIndex].text; const span = doc.createElement('span'); span.innerText = val !== 'انتخاب' ? val : ''; s.parentNode.replaceChild(span, s); }); const checkboxes = el.querySelectorAll('input[type="checkbox"]'); checkboxes.forEach((c: any) => { const span = doc.createElement('span'); span.innerText = c.checked ? '✅' : '⬜'; c.parentNode.replaceChild(span, c); }); } 
            }});
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            await apiCall('/send-whatsapp', 'POST', { number: target, message: `گزارش صف تخصیص ارز - ${new Date().toLocaleDateString('fa-IR')}`, mediaData: { data: base64, mimeType: 'image/png', filename: `allocation_report.png` } });
            alert('گزارش ارسال شد.');
        } catch (e: any) { alert(`خطا: ${e.message}`); } finally { setSendingReport(false); }
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border overflow-x-auto">
            {/* Top Bar: Rates & Actions */}
            <div className="bg-gray-100 p-3 rounded mb-4 border border-gray-200 no-print">
                <div className="flex justify-between items-start flex-wrap gap-4">
                    
                    {/* Toggle Rates Button */}
                    <div className="flex gap-2">
                        <button onClick={() => setShowRates(!showRates)} className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm ${showRates ? 'bg-blue-200 text-blue-800' : 'bg-white border text-gray-700'}`}>
                            <Settings size={16}/> تنظیم نرخ‌ها
                        </button>
                    </div>

                    {/* Rates Inputs (Collapsible) */}
                    {showRates && (
                        <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-4 bg-white p-3 rounded border border-blue-100 mb-2 animate-fade-in">
                            <div><label className="block text-[10px] text-gray-500 font-bold mb-1">یورو به دلار (EUR)</label><input type="number" step="0.01" className="w-full border rounded p-1 text-center dir-ltr font-bold text-sm" value={rates.eurToUsd} onChange={e => setRates({...rates, eurToUsd: parseFloat(e.target.value) || 0})} /></div>
                            <div><label className="block text-[10px] text-gray-500 font-bold mb-1">درهم به دلار (AED)</label><input type="number" step="0.001" className="w-full border rounded p-1 text-center dir-ltr font-bold text-sm" value={rates.aedToUsd} onChange={e => setRates({...rates, aedToUsd: parseFloat(e.target.value) || 0})} /></div>
                            <div><label className="block text-[10px] text-gray-500 font-bold mb-1">یوان به دلار (CNY)</label><input type="number" step="0.001" className="w-full border rounded p-1 text-center dir-ltr font-bold text-sm" value={rates.cnyToUsd} onChange={e => setRates({...rates, cnyToUsd: parseFloat(e.target.value) || 0})} /></div>
                            <div><label className="block text-[10px] text-gray-500 font-bold mb-1">لیر به دلار (TRY)</label><input type="number" step="0.001" className="w-full border rounded p-1 text-center dir-ltr font-bold text-sm" value={rates.tryToUsd} onChange={e => setRates({...rates, tryToUsd: parseFloat(e.target.value) || 0})} /></div>
                            <div><label className="block text-[10px] text-gray-500 font-bold mb-1">نرخ ریال (Rial)</label><input type="text" className="w-full border rounded p-1 text-center dir-ltr font-bold text-sm" value={formatNumberString(rates.rialRate)} onChange={e => setRates({...rates, rialRate: deformatNumberString(e.target.value)})} /></div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 w-full justify-end">
                        <button onClick={handleExport} className="bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 flex items-center gap-1 text-xs"><FileSpreadsheet size={14}/> اکسل</button>
                        <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center gap-1 text-xs">{isGeneratingPdf ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} PDF</button>
                        <button onClick={handleShareWhatsApp} disabled={sendingReport} className="bg-green-500 text-white px-3 py-1.5 rounded hover:bg-green-600 flex items-center gap-1 text-xs">{sendingReport ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14}/>} واتساپ</button>
                        <button onClick={handlePrint} className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center gap-1 text-xs"><Printer size={14}/> چاپ</button>
                    </div>
                </div>

                {/* Filters & Search */}
                <div className="mt-4 flex flex-col md:flex-row gap-3 items-end">
                    <div className="relative flex-1 w-full">
                        <input className="w-full border rounded-lg p-2 pl-9 text-sm" placeholder="جستجو در تمام ستون‌ها (پرونده، کالا، بانک، شرکت...)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        <Search size={16} className="absolute left-3 top-2.5 text-gray-400"/>
                    </div>
                    <button onClick={() => setShowFilters(!showFilters)} className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-sm ${showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white hover:bg-gray-50'}`}>
                        <Filter size={16}/> فیلترهای پیشرفته
                    </button>
                </div>

                {/* Advanced Filters Panel */}
                {showFilters && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 bg-white p-3 rounded border border-gray-200 animate-fade-in">
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">فیلتر شرکت</label>
                            <select className="w-full border rounded p-1.5 text-sm" value={filters.company} onChange={e => setFilters({...filters, company: e.target.value})}>
                                <option value="">همه شرکت‌ها</option>
                                {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">بانک عامل</label>
                            <select className="w-full border rounded p-1.5 text-sm" value={filters.bank} onChange={e => setFilters({...filters, bank: e.target.value})}>
                                <option value="">همه بانک‌ها</option>
                                {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">وضعیت تخصیص</label>
                            <select className="w-full border rounded p-1.5 text-sm" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
                                <option value="all">همه</option>
                                <option value="queue">در صف</option>
                                <option value="allocated">تخصیص یافته</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">اولویت</label>
                            <select className="w-full border rounded p-1.5 text-sm" value={filters.priority} onChange={e => setFilters({...filters, priority: e.target.value})}>
                                <option value="all">همه</option>
                                <option value="high">دارای اولویت</option>
                                <option value="normal">عادی</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">منشا ارز</label>
                            <select className="w-full border rounded p-1.5 text-sm" value={filters.origin} onChange={e => setFilters({...filters, origin: e.target.value})}>
                                <option value="all">همه</option>
                                <option value="Bank">بانکی</option>
                                <option value="Nima">نیما</option>
                                <option value="Export">صادرات</option>
                                <option value="Free">آزاد</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">نوع ارز (رتبه)</label>
                            <select className="w-full border rounded p-1.5 text-sm" value={filters.currencyType} onChange={e => setFilters({...filters, currencyType: e.target.value})}>
                                <option value="all">همه</option>
                                <option value="Type1">نوع اول</option>
                                <option value="Type2">نوع دوم</option>
                                <option value="unset">تعیین نشده</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button onClick={() => { setFilters({company: '', status: 'all', priority: 'all', currencyType: 'all', origin: 'all', bank: ''}); setSearchTerm(''); }} className="text-xs text-red-500 flex items-center gap-1 hover:bg-red-50 p-2 rounded w-full justify-center">
                                <X size={14}/> پاک کردن فیلترها
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Table Area */}
            <div id="allocation-report-table-print-area">
                <table className="w-full text-[11px] text-center border-collapse border border-gray-400">
                    <thead>
                        <tr className="bg-[#1e3a8a] text-white print:bg-blue-900 print:text-white">
                            <th className="p-1 border border-gray-400">ردیف</th>
                            <th className="p-1 border border-gray-400">پرونده / کالا</th>
                            <th className="p-1 border border-gray-400">ثبت سفارش</th>
                            <th className="p-1 border border-gray-400">شرکت</th>
                            <th className="p-1 border border-gray-400">مبلغ ارزی</th>
                            <th className="p-1 border border-gray-400">معادل دلار ($)</th>
                            <th className="p-1 border border-gray-400">معادل ریالی</th>
                            <th className="p-1 border border-gray-400">زمان در صف</th>
                            <th className="p-1 border border-gray-400">زمان تخصیص</th>
                            <th className="p-1 border border-gray-400">مانده مهلت (روز)</th>
                            <th className="p-1 border border-gray-400">وضعیت</th>
                            <th className="p-1 border border-gray-400">بانک عامل</th>
                            <th className="p-1 border border-gray-400 w-16">اولویت</th>
                            <th className="p-1 border border-gray-400 w-24">نوع ارز</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedRecords.length === 0 ? (
                            <tr><td colSpan={14} className="p-4 text-gray-500">موردی با این فیلترها یافت نشد.</td></tr>
                        ) : (
                            processedRecords.map((r, index) => {
                                let remainingColorClass = 'text-gray-500';
                                if (typeof r.remainingDays === 'number') {
                                    remainingColorClass = r.remainingDays > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold';
                                }

                                return (
                                    <tr key={r.id} className="hover:bg-gray-50 border-b border-gray-300">
                                        <td className="p-1 border-r border-gray-300">{index + 1}</td>
                                        <td className="p-1 border-r border-gray-300 text-right">
                                            <div className="font-bold">{r.fileNumber}</div>
                                            <div className="text-[9px] text-gray-500 truncate max-w-[100px]">{r.goodsName}</div>
                                        </td>
                                        <td className="p-1 border-r border-gray-300 font-mono">{r.registrationNumber || '-'}</td>
                                        <td className="p-1 border-r border-gray-300">{r.company}</td>
                                        <td className="p-1 border-r border-gray-300 dir-ltr font-mono">{formatCurrency(r.amount)} {r.mainCurrency}</td>
                                        <td className="p-1 border-r border-gray-300 dir-ltr font-mono font-bold">$ {formatUSD(r.amountInUSD)}</td>
                                        <td className="p-1 border-r border-gray-300 dir-ltr font-mono text-blue-600">{formatCurrency(r.rialEquiv)}</td>
                                        <td className="p-1 border-r border-gray-300 dir-ltr">{r.stageQ?.queueDate || '-'}</td>
                                        <td className="p-1 border-r border-gray-300 dir-ltr">{r.stageA?.allocationDate || '-'}</td>
                                        <td className={`p-1 border-r border-gray-300 ${remainingColorClass}`}>{r.remainingDays}</td>
                                        <td className={`p-1 border-r border-gray-300 font-bold ${r.isAllocated ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {r.isAllocated ? 'تخصیص یافته' : 'در صف'}
                                        </td>
                                        <td className="p-1 border-r border-gray-300 text-[10px]">{r.operatingBank || '-'}</td>
                                        
                                        {/* INTERACTIVE: Priority Checkbox */}
                                        <td className="p-1 border-r border-gray-300">
                                            <input 
                                                type="checkbox" 
                                                checked={r.isPriority || false} 
                                                onChange={(e) => onUpdateRecord(r, { isPriority: e.target.checked })}
                                                className="cursor-pointer"
                                            />
                                        </td>

                                        {/* INTERACTIVE: Currency Type Dropdown */}
                                        <td className="p-1 border-r border-gray-300">
                                            <select 
                                                className="w-full text-[10px] bg-transparent outline-none cursor-pointer text-center" 
                                                value={r.allocationCurrencyRank || ''}
                                                onChange={(e) => onUpdateRecord(r, { allocationCurrencyRank: e.target.value as any })}
                                            >
                                                <option value="">انتخاب</option>
                                                <option value="Type1">نوع اول</option>
                                                <option value="Type2">نوع دوم</option>
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>

                {/* Summary Table */}
                <div className="mt-6 border-t-2 border-blue-800 pt-2 break-inside-avoid">
                    <h3 className="text-right font-bold text-blue-900 mb-2 border-r-4 border-blue-800 pr-2">خلاصه وضعیت ارزی به تفکیک شرکت (دلار آمریکا)</h3>
                    <table className="w-full text-xs text-center border-collapse border border-gray-400">
                        <thead>
                            <tr className="bg-gray-100 text-gray-800">
                                <th className="p-2 border border-gray-400">نام شرکت</th>
                                <th className="p-2 border border-gray-400">جمع تخصیص یافته ($)</th>
                                <th className="p-2 border border-gray-400">جمع در صف ($)</th>
                                <th className="p-2 border border-gray-400 bg-gray-200">مجموع کل ($)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(companySummary).map(([comp, data]) => (
                                <tr key={comp} className="hover:bg-gray-50 border-b border-gray-300">
                                    <td className="p-2 border-r border-gray-300 font-bold">{comp}</td>
                                    <td className="p-2 border-r border-gray-300 font-mono text-green-700 font-bold">{formatUSD(data.allocated)}</td>
                                    <td className="p-2 border-r border-gray-300 font-mono text-amber-700 font-bold">{formatUSD(data.queue)}</td>
                                    <td className="p-2 border-r border-gray-300 font-mono font-black bg-gray-50">{formatUSD(data.allocated + data.queue)}</td>
                                </tr>
                            ))}
                            <tr className="bg-gray-300 font-black border-t-2 border-gray-500">
                                <td className="p-2 border-r border-gray-400">جمع نهایی</td>
                                <td className="p-2 border-r border-gray-400 font-mono">{formatUSD(totalAllocated)}</td>
                                <td className="p-2 border-r border-gray-400 font-mono">{formatUSD(totalQueue)}</td>
                                <td className="p-2 border-r border-gray-400 font-mono">{formatUSD(totalAllocated + totalQueue)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AllocationReport;
