import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getClient, getTransactionsByClient, addTransaction as dbAddTransaction, updateTransaction, deleteTransaction as dbDeleteTransaction, updateClient, type Client, type Transaction } from '@/lib/db';
import AppHeader from '@/components/AppHeader';
import PaymentReminderCard from '@/components/PaymentReminderCard';
import LedgerPDFExport from '@/components/LedgerPDFExport';
import ClientNotesSheet from '@/components/ClientNotesSheet';
import ClientRating from '@/components/ClientRating';
import { Card, CardContent } from '@/components/ui/card';
import { Phone, MessageCircle, Share2, Plus, AlertTriangle, Pencil, Trash2, FileText, X, StickyNote, HelpCircle, MoreVertical, Search, Printer, FileSpreadsheet, MessageSquare, Lock, ArrowRightLeft, Bell, ShieldAlert, ListFilter, Camera } from 'lucide-react';
import { toast } from 'sonner';

const LedgerPage = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<(Transaction & { balance: number })[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  
  // States for Edit
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDetails, setEditDetails] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<'debit' | 'credit'>('debit'); 
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false); 
  
  // New States for Long Press & Modals
  const [longPressedTx, setLongPressedTx] = useState<(Transaction & { balance: number }) | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [newLimit, setNewLimit] = useState('');
  const [showCloseBalanceModal, setShowCloseBalanceModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const c = await getClient(Number(clientId));
    if (c) {
      setClient(c);
      setNewLimit(c.budgetLimit?.toString() || '0');
    }

    const txns = await getTransactionsByClient(Number(clientId));
    let balance = 0, dTotal = 0, cTotal = 0;
    
    // مصدات الأمان
    const withBalance = txns.map(t => {
      const safeAmount = Number(t.amount) || 0;
      const safeDetails = t.details || '';
      const safeDate = t.date || '';
      const safeType = t.type === 'credit' ? 'credit' : 'debit';

      if (safeType === 'debit') { balance += safeAmount; dTotal += safeAmount; }
      else { balance -= safeAmount; cTotal += safeAmount; }
      
      return { ...t, amount: safeAmount, details: safeDetails, date: safeDate, type: safeType, balance };
    });
    
    setTransactions(withBalance.reverse());
    setTotalDebit(dTotal);
    setTotalCredit(cTotal);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const netBalance = totalDebit - totalCredit;
  const budgetLimit = client?.budgetLimit || 0;
  const remaining = budgetLimit - totalDebit + totalCredit;
  const consumed = budgetLimit > 0 ? Math.min(((totalDebit - totalCredit) / budgetLimit) * 100, 100) : 0;
  const isOverBudget = budgetLimit > 0 && remaining < 0;

  const filteredTransactions = searchQuery
    ? transactions.filter(tx => 
        (tx.details || '').includes(searchQuery) || 
        (tx.amount || 0).toString().includes(searchQuery) || 
        (tx.date || '').includes(searchQuery)
      )
    : transactions;

  const handleTouchStart = (tx: Transaction & { balance: number }) => {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(50);
      setLongPressedTx(tx);
    }, 500); 
  };

  const handleTouchEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const handleWhatsApp = () => { if (client?.phone) window.open(`https://wa.me/${client.phone}`, '_blank'); };
  const handleCall = () => { if (client?.phone) window.open(`tel:${client.phone}`); };

  const handleSMS = () => {
    const msg = `عزيزي العميل ${client?.name || ''}، رصيدك الحالي هو: ${Math.abs(netBalance).toLocaleString('en-US')} ${netBalance >= 0 ? 'عليك' : 'لك'}.`;
    window.open(`sms:${client?.phone}?body=${encodeURIComponent(msg)}`, '_blank');
    setShowMenu(false);
  };

  const handleExportExcel = () => {
    let csv = 'التاريخ,المبلغ,التفاصيل,الرصيد\n';
    transactions.forEach(tx => {
      csv += `${tx.date},${tx.amount},${tx.details},${tx.balance}\n`;
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كشف_حساب_${client?.name || 'عميل'}.csv`;
    link.click();
    toast.success('تم تحميل ملف الإكسل');
    setShowMenu(false);
  };

  const handleThermalPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    let html = `<html dir="rtl"><head><title>طباعة إيصال</title><style>
      body { font-family: sans-serif; width: 80mm; margin: 0 auto; padding: 10px; font-size: 14px; color: #000; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th, td { border-bottom: 1px dashed #000; padding: 6px 0; text-align: center; font-size: 12px; }
      .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
      h2 { margin: 0 0 5px 0; font-size: 18px; }
      p { margin: 3px 0; }
    </style></head><body>`;
    html += `<div class="header"><h2>كشف حساب</h2><p>العميل: ${client?.name || 'غير محدد'}</p><p>الرصيد: ${Math.abs(netBalance).toLocaleString('en-US')} ${netBalance >= 0 ? 'عليه' : 'له'}</p></div>`;
    html += `<table><tr><th>التاريخ</th><th>المبلغ</th><th>البيان</th><th>الرصيد</th></tr>`;
    transactions.forEach(tx => {
      html += `<tr><td>${tx.date}</td><td>${tx.amount}</td><td>${tx.details}</td><td>${tx.balance}</td></tr>`;
    });
    html += `</table><p style="text-align:center; margin-top:20px; font-size:12px;">نظام إدارة الحسابات</p></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    setShowMenu(false);
  };

  const handleSaveLimit = async () => {
    if (!client?.id) return;
    await updateClient(client.id, { budgetLimit: Number(newLimit) });
    setShowLimitModal(false);
    loadData();
    toast.success('تم تحديث سقف الحساب بنجاح');
  };

  const handleCloseBalance = async () => {
    if (!client?.id || netBalance === 0) {
      toast.info('الرصيد مصفر بالفعل');
      setShowCloseBalanceModal(false);
      return;
    }
    const amountToZero = Math.abs(netBalance);
    const type = netBalance >= 0 ? 'credit' : 'debit'; 
    await dbAddTransaction({ 
      clientId: client.id, 
      amount: amountToZero, 
      type, 
      date: new Date().toISOString().split('T')[0], 
      details: 'إغلاق وتصفية الحساب' 
    });
    setShowCloseBalanceModal(false);
    loadData();
    toast.success('تم تصفية الرصيد بنجاح ✓');
  };

  const startEditTx = (tx: Transaction & { balance: number }) => {
    setEditingTx(tx);
    setEditAmount((tx.amount || 0).toString());
    setEditDetails(tx.details || '');
    setEditDate(tx.date || '');
    setEditType(tx.type);
  };

  const saveEditTx = async () => {
    if (!editingTx?.id) return;
    await updateTransaction(editingTx.id, {
      amount: parseFloat(editAmount) || 0,
      details: editDetails.trim(),
      date: editDate,
      type: editType,
    });
    setEditingTx(null);
    toast.success('تم تعديل المعاملة ✓');
    loadData();
  };

  const confirmDeleteTx = async () => {
    if (showDeleteConfirm === null) return;
    await dbDeleteTransaction(showDeleteConfirm);
    setShowDeleteConfirm(null);
    toast.success('تم حذف المعاملة');
    loadData();
  };

  const handleRatingChange = async (rating: 'excellent' | 'average' | 'poor') => {
    if (!client?.id) return;
    await updateClient(client.id, { rating });
    setClient(prev => prev ? { ...prev, rating } : prev);
    toast.success('تم تحديث التقييم ✓');
  };

  const handleAddNote = async (note: string) => {
    if (!client?.id) return;
    const updatedNotes = [...(client.notes || []), note];
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
  };

  const handleDeleteNote = async (index: number) => {
    if (!client?.id) return;
    const updatedNotes = [...(client.notes || [])];
    updatedNotes.splice(index, 1);
    await updateClient(client.id, { notes: updatedNotes });
    setClient(prev => prev ? { ...prev, notes: updatedNotes } : prev);
  };

  const handleShareImage = async () => {
    toast.info('جاري تجهيز الصورة، الرجاء الانتظار...');
    const loadHtml2Canvas = () => {
      return new Promise((resolve, reject) => {
        if ((window as any).html2canvas) {
          resolve((window as any).html2canvas);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve((window as any).html2canvas);
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    try {
      const html2canvasLib = await loadHtml2Canvas() as any;
      const element = document.getElementById('ledger-content-to-capture'); 
      if (!element) return;

      const canvas = await html2canvasLib(element, { 
        scale: 2, 
        backgroundColor: '#ffffff' 
      });
      
      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) return;
        const fileName = `كشف_حساب_${client?.name || 'عميل'}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'صورة كشف الحساب',
            text: `تفاصيل حساب ${client?.name || 'العميل'}`
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = fileName; a.click();
        }
      }, 'image/png');
    } catch (error) {
      console.error('Snapshot error:', error);
      toast.error('حدث خطأ أثناء التقاط الصورة');
    }
    setShowShareModal(false);
  };
  
  return (
    <div className="min-h-screen bg-background pb-24 flex flex-col">
      <AppHeader
        title={client?.name || '...'}
        showBack
        showSearch={false} 
        showNotifications={false}
        actions={
          /* تم إضافة flex-shrink-0 للـ 3 نقاط وتقليل المسافات عشان ما تختفي في التلفون */
          <div className="flex items-center gap-1 sm:gap-2 overflow-visible">
            
            {/* حيلة برمجية قوية (CSS Hack) لإخفاء زر الواتس من المكون الداخلي بالقوة */}
            <style>{`
              .pdf-wrap-clean a, .pdf-wrap-clean button:nth-of-type(2) { display: none !important; }
            `}</style>
            
            {client && transactions.length > 0 && (
              <div className="pdf-wrap-clean bg-[#fdfbf7] rounded-lg px-2 py-1 shadow-sm border border-gray-200 opacity-95 scale-[0.85] origin-right flex-shrink-1 max-w-[100px] overflow-hidden">
                <LedgerPDFExport
                  client={client}
                  transactions={transactions}
                  totalDebit={totalDebit}
                  totalCredit={totalCredit}
                  netBalance={netBalance}
                />
              </div>
            )}
            
            {/* التقييم رجع في مكانه وصغرناه شوية عشان المساحة */}
            {client && <div className="flex-shrink-0 scale-90"><ClientRating rating={client.rating} onChange={handleRatingChange} /></div>}
            
            <button onClick={() => setShowNotes(true)} className="p-1 hover:opacity-70 transition-opacity flex-shrink-0" title="ملاحظات">
              <StickyNote className="w-5 h-5 text-primary" />
            </button>
            
            <div className="relative z-50 flex-shrink-0">
              <button onClick={() => setShowMenu(!showMenu)} className="p-1 hover:opacity-70 transition-opacity">
                <MoreVertical className="w-6 h-6 text-foreground" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute top-full left-0 mt-2 w-56 bg-card border border-border shadow-2xl rounded-xl overflow-hidden z-50 animate-scale-in" dir="rtl">
                    <button onClick={() => { setShowSearch(!showSearch); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50">
                      <Search className="w-4 h-4 text-primary" /> بحث متقدم
                    </button>
                    <button onClick={handleThermalPrint} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50">
                      <Printer className="w-4 h-4 text-primary" /> طابعة حرارية
                    </button>
                    <button onClick={() => { setShowCloseBalanceModal(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50">
                      <Lock className="w-4 h-4 text-primary" /> إغلاق الرصيد
                    </button>
                    <button onClick={() => { toast.info('افتح شاشة التحويل لإتمام هذه العملية'); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50">
                      <ArrowRightLeft className="w-4 h-4 text-primary" /> تحويل من حساب
                    </button>
                    <button onClick={() => { toast.info('التنبيهات مفعلة'); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-b border-border/50">
                      <Bell className="w-4 h-4 text-primary" /> التنبيهات
                    </button>
                    <button onClick={() => { setShowLimitModal(true); setShowMenu(false); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors">
                      <ShieldAlert className="w-4 h-4 text-primary" /> سقف الحساب
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />

      {showSearch && (
        <div className="px-3 pt-2 animate-fade-in">
          <div className="relative">
            <input
              autoFocus
              className="w-full bg-card border border-border rounded-xl pr-4 pl-10 py-2.5 text-right text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="ابحث في المعاملات..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      <div id="ledger-content-to-capture" className="flex flex-col flex-1 bg-background pb-2">
        {budgetLimit > 0 && (
          <div className="sticky top-[52px] z-30 mx-3 mt-2 rounded-xl overflow-hidden shadow-xl animate-fade-in">
            <div className="bg-gradient-to-l from-[hsl(var(--header-bg))] to-[hsl(var(--limit-bar-bg))] text-limit-bar p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  {isOverBudget && <AlertTriangle className="w-5 h-5 text-debit animate-pulse" />}
                  <div className="flex flex-col">
                    <span className="text-[11px] opacity-70">المتبقي من السقف</span>
                    <span className={`text-2xl font-extrabold tracking-tight ${isOverBudget ? 'text-debit' : 'text-yellow-300'}`}>
                      {remaining.toLocaleString('en-US')}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 text-[11px] opacity-80">
                  <span>حد السقف المسموح: <strong className="text-sm opacity-100">{budgetLimit.toLocaleString('en-US')}</strong></span>
                  <span>استهلاك السقف: <strong className="text-sm opacity-100">{(totalDebit - totalCredit).toLocaleString('en-US')}</strong></span>
                </div>
              </div>
              <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden backdrop-blur-sm">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${isOverBudget ? 'bg-[hsl(var(--debit-color))]' : 'bg-yellow-300'}`}
                  style={{ width: `${Math.min(consumed, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="p-3 flex-1">
          <Card className="shadow-lg border-0 overflow-hidden animate-fade-in-up">
            <CardContent className="p-0">
              <div className="bg-table-header text-table-header grid grid-cols-[1fr_1.2fr_2fr_1.2fr] text-center text-sm font-bold py-3 px-2 rounded-t-lg">
                <span>التاريخ</span>
                <span>المبلغ</span>
                <span>التفاصيل</span>
                <span>الرصيد</span>
              </div>

              <div className="max-h-[55vh] overflow-y-auto select-none">
                {loading ? (
                  <div className="py-20 flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">جاري التحميل...</span>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="py-20 flex flex-col items-center gap-3 animate-fade-in">
                    <FileText className="w-14 h-14 text-muted-foreground/40" />
                    <p className="text-center text-muted-foreground text-sm font-semibold">
                      {searchQuery ? 'لا توجد نتائج' : 'لا توجد معاملات بعد'}
                    </p>
                  </div>
                ) : (
                  filteredTransactions.map((tx, i) => (
                    <div
                      key={tx.id}
                      className={`grid grid-cols-[1fr_1.2fr_2fr_1.2fr] text-center py-3 px-1 border-b border-border animate-fade-in cursor-pointer active:bg-primary/10 transition-colors ${i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}`}
                      style={{ animationDelay: `${i * 30}ms` }}
                      onTouchStart={() => handleTouchStart(tx)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                      onMouseDown={() => handleTouchStart(tx)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                    >
                      <span className="text-foreground text-[11px] flex items-center justify-center">{tx.date}</span>
                      <span className="font-semibold text-foreground text-sm flex items-center justify-center">{(tx.amount || 0).toLocaleString('en-US')}</span>
                      <span className="text-foreground text-[12px] flex items-center justify-center px-1 break-words whitespace-normal leading-tight">{tx.details}</span>
                      <span className="flex items-center justify-center gap-1 font-bold text-xs">
                        
                        {tx.type === 'credit' ? (
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-credit fill-current flex-shrink-0" aria-hidden="true">
                            <path d="M21.5 18l-9.5-12-9.5 12h19z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-debit fill-current flex-shrink-0" aria-hidden="true">
                            <path d="M2.5 6l9.5 12 9.5-12h-19z" />
                          </svg>
                        )}
                        <span>{(tx.balance || 0).toLocaleString('en-US')}</span>

                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 bg-bottom-bar text-bottom-bar z-20 shadow-[0_-2px_15px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between px-3 py-3">
          {/* زر الإضافة - يمين */}
          <button onClick={() => navigate(`/add-transaction?clientId=${clientId}`)} className="flex items-center gap-1.5 bg-[#FFD54F]/20 hover:bg-[#FFD54F]/30 text-[#FFD54F] px-4 py-2 rounded-lg transition-colors border border-[#FFD54F]/30 shadow-sm">
            <span className="text-sm font-bold">إضافة مبلغ</span>
            <Plus className="w-4 h-4" />
          </button>
          
          <div className="text-center text-sm font-bold bg-white/5 px-3 py-2 rounded-lg">
            {netBalance >= 0 ? 'عليه' : 'له'}: {Math.abs(netBalance).toLocaleString('en-US')}
          </div>
          
          {/* زر المشاركة - يسار */}
          <button onClick={() => setShowShareModal(true)} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors">
            <Share2 className="w-4 h-4" />
            <span className="text-sm font-bold">مشاركة</span>
          </button>
        </div>
      </footer>

      {showShareModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowShareModal(false)}>
          <div className="bg-white w-64 rounded-lg shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="flex flex-col">
              <button onClick={() => { window.print(); setShowShareModal(false); }} className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-end gap-4 hover:bg-gray-50 transition-colors">
                <span className="font-bold text-gray-800 text-lg">PDF</span>
                <FileText className="w-6 h-6 text-red-600" />
              </button>
              <button onClick={handleShareImage} className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-end gap-4 hover:bg-gray-50 transition-colors">
                <span className="font-bold text-gray-800 text-lg">صورة</span>
                <Camera className="w-6 h-6 text-gray-600" />
              </button>
              <button onClick={() => { handleSMS(); setShowShareModal(false); }} className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-end gap-4 hover:bg-gray-50 transition-colors">
                <span className="font-bold text-gray-800 text-lg">رسالة نصية</span>
                <MessageSquare className="w-6 h-6 text-blue-400" />
              </button>
              <button onClick={() => { handleExportExcel(); setShowShareModal(false); }} className="px-5 py-3.5 flex items-center justify-end gap-4 hover:bg-gray-50 transition-colors">
                <span className="font-bold text-gray-800 text-lg">إكسل</span>
                <FileSpreadsheet className="w-6 h-6 text-green-600" />
              </button>
            </div>
          </div>
        </div>
      )}

      {longPressedTx && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-end justify-center animate-fade-in" onClick={() => setLongPressedTx(null)}>
          <div className="bg-card w-full rounded-t-2xl p-4 space-y-3 animate-slide-up shadow-2xl border-t border-border" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="w-12 h-1.5 bg-muted mx-auto rounded-full mb-4" />
            <div className="text-center mb-4">
              <p className="font-bold text-lg text-foreground">{(longPressedTx.amount || 0).toLocaleString('en-US')}</p>
              <p className="text-sm text-muted-foreground">{longPressedTx.details}</p>
            </div>
            <button onClick={() => { setShowDeleteConfirm(longPressedTx.id!); setLongPressedTx(null); }} className="w-full flex items-center gap-3 p-4 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold transition-colors">
              <Trash2 className="w-5 h-5" /> حذف العملية
            </button>
            <button onClick={() => { startEditTx(longPressedTx); setLongPressedTx(null); }} className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-semibold transition-colors">
              <Pencil className="w-5 h-5 text-blue-500" /> تعديل العملية
            </button>
            <button onClick={() => { toast.info('ميزة تلوين المعاملة قيد الإعداد'); setLongPressedTx(null); }} className="w-full flex items-center gap-3 p-4 rounded-xl bg-muted/50 hover:bg-muted text-foreground font-semibold transition-colors">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-red-500 via-yellow-500 to-green-500" /> تلوين المعامله
            </button>
          </div>
        </div>
      )}

      {showLimitModal && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowLimitModal(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-6 h-6 text-primary" />
                <h2 className="text-lg font-bold text-foreground">تعديل سقف الحساب</h2>
              </div>
              <div>
                <label className="text-sm font-semibold text-muted-foreground mb-2 block">السقف المالي الجديد</label>
                <input className="w-full border border-input rounded-lg px-4 py-3 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary" type="number" value={newLimit} onChange={e => setNewLimit(e.target.value)} placeholder="أدخل مبلغ السقف..." />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveLimit} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold">حفظ السقف</button>
                <button onClick={() => setShowLimitModal(false)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showCloseBalanceModal && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowCloseBalanceModal(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">تصفية وإغلاق الرصيد</h2>
              <p className="text-sm text-muted-foreground">سيتم إنشاء معاملة تلقائية بمبلغ <strong className="text-foreground">{Math.abs(netBalance).toLocaleString('en-US')}</strong> لتصفية الحساب بالكامل. هل أنت متأكد؟</p>
              <div className="flex gap-2">
                <button onClick={handleCloseBalance} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold">تأكيد التصفية</button>
                <button onClick={() => setShowCloseBalanceModal(false)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {editingTx && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setEditingTx(null)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Pencil className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">تعديل المعاملة</h2>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">المبلغ</label>
                <input className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">التفاصيل</label>
                <input className="w-full border border-input rounded-lg px-3 py-2.5 text-right bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" value={editDetails} onChange={e => setEditDetails(e.target.value)} />
              </div>
              
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">التاريخ</label>
                <input className="w-full border border-input rounded-lg px-3 py-2.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>

              <div className="flex gap-4 justify-center pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="editTransactionType" 
                    value="debit" 
                    checked={editType === 'debit'} 
                    onChange={() => setEditType('debit')} 
                    className="w-5 h-5 accent-[hsl(var(--debit-color))]" 
                  />
                  <span className="font-bold text-foreground">عليه</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="editTransactionType" 
                    value="credit" 
                    checked={editType === 'credit'} 
                    onChange={() => setEditType('credit')} 
                    className="w-5 h-5 accent-[hsl(var(--credit-color))]" 
                  />
                  <span className="font-bold text-foreground">له</span>
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={saveEditTx} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold">حفظ</button>
                <button onClick={() => setEditingTx(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowDeleteConfirm(null)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-6 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                <Trash2 className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-lg font-bold text-foreground">تأكيد حذف المعاملة</h2>
              <p className="text-sm text-muted-foreground">سيتم حذف هذه المعاملة نهائياً وتحديث الرصيد. هل أنت متأكد؟</p>
              <div className="flex gap-2">
                <button onClick={confirmDeleteTx} className="flex-1 bg-destructive text-destructive-foreground py-2.5 rounded-lg font-semibold">حذف</button>
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 bg-muted text-foreground py-2.5 rounded-lg font-semibold">إلغاء</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ClientNotesSheet
        open={showNotes}
        onClose={() => setShowNotes(false)}
        notes={client?.notes || []}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
      />

      {showHelp && (
        <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in" onClick={() => setShowHelp(false)}>
          <Card className="shadow-xl w-80 border-0 animate-scale-in" onClick={e => e.stopPropagation()} dir="rtl">
            <CardContent className="p-6 text-center space-y-4">
              <HelpCircle className="w-12 h-12 mx-auto text-primary" />
              <h2 className="text-lg font-bold text-foreground">كيفية الاستخدام</h2>
              <p className="text-sm text-muted-foreground leading-relaxed text-right">
                - اضغط بشكل مطول على أي معاملة لتعديلها أو حذفها.<br/>
                - استخدم الثلاث نقاط بالأعلى لخيارات الطباعة وإغلاق الرصيد وتصدير الإكسل.
              </p>
              <button onClick={() => setShowHelp(false)} className="w-full bg-primary text-primary-foreground py-2.5 rounded-lg font-bold">فهمت</button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default LedgerPage;
