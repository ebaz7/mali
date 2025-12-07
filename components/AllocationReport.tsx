
import React, { useState } from 'react';
import { TradeRecord, TradeStage } from '../types';
import { formatCurrency, formatNumberString, deformatNumberString, parsePersianDate, calculateDaysDiff } from '../constants';
import { FileSpreadsheet, Printer, FileDown, Share2, Loader2, RefreshCw } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface AllocationReportProps {
    records: TradeRecord[];
    onUpdateRecord: (record: TradeRecord, updates: Partial<TradeRecord>) => Promise<void>;
    settings: any;
}

const AllocationReport: React.FC<AllocationReportProps> = ({ records, onUpdateRecord, settings }) => {
    const [reportEurUsdRate, setReportEurUsdRate] = useState<string>('1.08');
    const [reportUsdRialRate, setReportUsdRialRate] = useState<string>('500000');
    const [reportFilterCompany, setReportFilterCompany] = useState<string>('');
    const [sendingReport, setSendingReport] = useState(false);

    // Filter Logic
    const availableCompanies = Array.from(new Set(records.map(r => r.company).filter(Boolean)));
    const filteredRecords = records.filter(r => {
        if (r.status === 'Completed') return false; // Show active only
        if (reportFilterCompany && r.company !== reportFilterCompany) return false;
        return true;
    });

    const usdRate = parseFloat(reportEurUsdRate) || 1.08;
    const rialRate = deformatNumberString(reportUsdRialRate) || 0;

    // Calculation Logic
    const processedRecords = filteredRecords.map(r => {
        const stageQ = r.stages[TradeStage.ALLOCATION_QUEUE];
        const stageA = r.stages[TradeStage.ALLOCATION_APPROVED];
        
        // Status: Strictly based on Stage Completed check
        const isAllocated = stageA?.isCompleted;

        // Amount logic (Fallback to items total)
        let amount = stageQ?.costCurrency;
        if (!amount || amount === 0) {
            amount = r.items.reduce((sum, item) => sum + item.totalPrice, 0);
        }

        const currency = r.mainCurrency || 'EUR';
        let amountInUSD = 0;
        if (currency === 'USD') amountInUSD = amount;
        else if (currency === 'EUR') amountInUSD = amount * usdRate;
        else amountInUSD = amount; 

        const rialEquiv = amountInUSD * rialRate;

        // Expiry Calculation (Allocation Date + 30 Days)
        let remainingDays: string | number = '-';
        let expiryDateStr = '-';
        
        if (isAllocated && stageA?.allocationDate) {
            const allocDate = parsePersianDate(stageA.allocationDate);
            if (allocDate) {
                // Add 30 days
                const expiryDate = new Date(allocDate);
                expiryDate.setDate(expiryDate.getDate() + 30);
                
                // Format Expiry to Shamsi for display (Optional, but good for debugging)
                // expiryDateStr = new Intl.DateTimeFormat('fa-IR').format(expiryDate);

                // Calculate remaining
                const now = new Date();
                const diffTime = expiryDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                remainingDays = diffDays;
            }
        }

        // Summary Data
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

    // Summary Calculation
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

    // Print Function (With Delay to fix white screen)
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
                    body { background: white; margin: 0; padding: 20px; font-family: 'Vazirmatn', sans-serif; direction: rtl; } 
                    table { width: 100%; border-collapse: collapse; font-size: 10pt; } 
                    th, td { border: 1px solid #000; padding: 4px; text-align: center; } 
                    th { background-color: #1e3a8a !important; color: white !important; font-weight: bold; } 
                    .no-print { display: none !important; }
                    select { appearance: none; border: none; background: transparent; text-align: center; width: 100%; font-family: inherit; }
                    input[type="checkbox"] { width: 16px; height: 16px; }
                    @media print { 
                        @page { size: A4 landscape; margin: 10mm; } 
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
                    }
                </style>
            </head>
            <body>
                <div style="width: 100%;">
                    <h2 style="text-align: center; margin-bottom: 20px; font-weight: bold;">گزارش صف تخصیص ارز</h2>
                    ${content.innerHTML}
                </div>
                <script>
                    setTimeout(function() { 
                        window.focus(); 
                        window.print(); 
                    }, 1000); // 1 Second Delay
                </script>
            </body>
            </html>
        `);
        doc.close();

        setTimeout(() => {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
        }, 60000);
    };

    // Excel Export
    const handleExport = () => {
        const rows = [];
        const headers = ["ردیف", "شماره پرونده", "شماره ثبت سفارش", "شرکت", "فروشنده", "منشا ارز", "مبلغ ارزی", "تبدیل به دلار", "معادل ریالی", "زمان در صف", "زمان تخصیص", "مانده مهلت (روز)", "وضعیت", "بانک عامل", "اولویت", "نوع ارز"];
        rows.push(headers.join(","));
        const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;

        processedRecords.forEach((r, index) => {
            const row = [
                index + 1,
                escape(r.fileNumber),
                escape(r.registrationNumber),
                escape(r.company),
                escape(r.sellerName),
                escape(r.currencyAllocationType === 'Bank' ? 'بانکی' : r.currencyAllocationType === 'Nima' ? 'نیما' : r.currencyAllocationType === 'Export' ? 'صادرات' : 'آزاد'),
                escape(`${formatCurrency(r.amount)} ${r.mainCurrency}`),
                escape(r.amountInUSD.toFixed(2)),
                escape(r.rialEquiv),
                escape(r.stageQ?.queueDate),
                escape(r.stageA?.allocationDate),
                escape(r.remainingDays),
                escape(r.isAllocated ? 'تخصیص یافته' : 'در صف'),
                escape(r.operatingBank),
                escape(r.isPriority ? 'بله' : 'خیر'),
                escape(r.allocationCurrencyRank === 'Type1' ? 'نوع اول' : r.allocationCurrencyRank === 'Type2' ? 'نوع دوم' : '')
            ];
            rows.push(row.join(","));
        });

        const csvContent = "\uFEFF" + rows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Allocation_Report_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleShareWhatsApp = async () => {
        if (!settings?.whatsappNumber) {
            alert('شماره واتساپ در تنظیمات وارد نشده است.');
            return;
        }
        let target = prompt("شماره یا آیدی گروه را وارد کنید:", settings.whatsappNumber);
        if (!target) return;

        setSendingReport(true);
        const element = document.getElementById('allocation-report-table-print-area');
        if (!element) { setSendingReport(false); return; }

        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                onclone: (doc: any) => {
                    const el = doc.getElementById('allocation-report-table-print-area');
                    if (el) {
                        el.style.width = '1400px'; 
                        el.style.direction = 'rtl';
                        // Force Inputs to be visible text
                        const selects = el.querySelectorAll('select');
                        selects.forEach((s: any) => {
                            const val = s.options[s.selectedIndex].text;
                            const span = doc.createElement('span');
                            span.innerText = val;
                            s.parentNode.replaceChild(span, s);
                        });
                    }
                }
            });
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            
            await apiCall('/send-whatsapp', 'POST', {
                number: target,
                message: `گزارش صف تخصیص ارز - ${new Date().toLocaleDateString('fa-IR')}`,
                mediaData: {
                    data: base64,
                    mimeType: 'image/png',
                    filename: `allocation_report.png`
                }
            });
            alert('گزارش با موفقیت به واتساپ ارسال شد.');
        } catch (e: any) {
            alert(`خطا در ارسال: ${e.message}`);
        } finally {
            setSendingReport(false);
        }
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border overflow-x-auto">
            {/* Controls */}
            <div className="bg-gray-100 p-3 rounded mb-4 flex flex-wrap gap-4 text-xs no-print items-center justify-between border border-gray-200">
                <div className="flex gap-4 items-center flex-wrap">
                    <div className="flex items-center gap-2">
                        <label className="font-bold text-gray-700">فیلتر شرکت:</label>
                        <select className="border p-1.5 rounded" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}>
                            <option value="">همه شرکت‌ها</option>
                            {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="font-bold text-gray-700">نرخ EUR به USD:</label>
                        <input type="number" step="0.01" className="border p-1.5 rounded w-16 text-center font-bold" value={reportEurUsdRate} onChange={e => setReportEurUsdRate(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="font-bold text-gray-700">نرخ ریال:</label>
                        <input type="text" className="border p-1.5 rounded w-28 text-center font-bold" value={formatNumberString(reportUsdRialRate)} onChange={e => setReportUsdRialRate(deformatNumberString(e.target.value).toString())} />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 flex items-center gap-1"><FileSpreadsheet size={14}/> اکسل</button>
                    <button onClick={handleShareWhatsApp} disabled={sendingReport} className="bg-green-500 text-white px-3 py-1.5 rounded hover:bg-green-600 flex items-center gap-1">{sendingReport ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14}/>} واتساپ</button>
                    <button onClick={handlePrint} className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center gap-1"><Printer size={14}/> چاپ</button>
                </div>
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
                            <th className="p-1 border border-gray-400">معادل دلار</th>
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
                        {processedRecords.map((r, index) => {
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
                                            className="w-full text-[10px] bg-transparent outline-none cursor-pointer" 
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
                        })}
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
