import { getAllClients, getAllTransactions, type Client, type Transaction, encrypt, decrypt } from './db';
import { openDB } from 'idb';
import { toast } from 'sonner';

const DB_NAME = 'LedgerDB';
const DB_VERSION = 1;

async function generateBackupData(): Promise<string> {
  const [clients, transactions] = await Promise.all([getAllClients(), getAllTransactions()]);
  const backupData = {
    clients,
    transactions,
    exportDate: new Date().toISOString(),
    version: '2.0',
    appVersion: '1.0.0'
  };
  let finalData = JSON.stringify(backupData, null, 2);
  if (typeof encrypt === 'function') {
    try { finalData = encrypt(finalData); } catch (e) {}
  }
  return finalData;
}

// 1. وظيفة التنزيل الصرف (Download Only)
export async function downloadBackup(): Promise<void> {
  try {
    const finalData = await generateBackupData();
    const fileName = `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([finalData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.body.appendChild(document.createElement('a'));
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    toast.success('تم حفظ الملف في الجهاز ✓');
  } catch (e) { toast.error('فشل التنزيل'); }
}

// 2. وظيفة المشاركة الصرف (Share Only - واتساب / درايف)
export async function shareBackup(): Promise<void> {
  try {
    const finalData = await generateBackupData();
    const fileName = `Ledger-Backup.json`;
    const file = new File([finalData], fileName, { type: 'application/json' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'نسخة احتياطية',
        text: 'بيانات تطبيق دفتر الحسابات'
      });
    } else {
      throw new Error('Sharing not supported');
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') toast.error('المشاركة غير مدعومة في هذا المتصفح، استخدم التنزيل.');
  }
}

export async function exportBackup() { return shareBackup(); }

// 3. وظيفة الاسترجاع (تدعم أي ملف JSON)
export async function importBackup(file: File): Promise<{ clients: number; transactions: number }> {
  const text = await file.text();
  let decrypted = text;
  if (typeof decrypt === 'function') { try { decrypted = decrypt(text); } catch (e) { decrypted = text; } }
  
  const data = JSON.parse(decrypted);
  const db = await openDB(DB_NAME, DB_VERSION);
  const tx = db.transaction(['clients', 'transactions'], 'readwrite');
  await Promise.all([tx.objectStore('clients').clear(), tx.objectStore('transactions').clear()]);
  for (const c of (data.clients || [])) await tx.objectStore('clients').put(c);
  for (const t of (data.transactions || [])) await tx.objectStore('transactions').put(t);
  await tx.done;
  return { clients: data.clients?.length || 0, transactions: data.transactions?.length || 0 };
}
