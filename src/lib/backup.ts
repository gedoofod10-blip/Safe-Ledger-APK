import { getAllClients, getAllTransactions, type Client, type Transaction, encrypt, decrypt } from './db';
import { openDB } from 'idb';
import { toast } from 'sonner';

const DB_NAME = 'LedgerDB';
const DB_VERSION = 1;

/**
 * جلب وتجهيز البيانات كملف نصي نقي (JSON) - بدون أي ضغط
 */
async function generateBackupData(): Promise<string> {
  const [clients, transactions] = await Promise.all([
    getAllClients(),
    getAllTransactions()
  ]);

  const backupData = {
    clients,
    transactions,
    exportDate: new Date().toISOString(),
    version: '2.0',
    appVersion: '1.0.0'
  };

  let finalData = JSON.stringify(backupData, null, 2);

  // التشفير (إذا كان متاحاً)
  if (typeof encrypt === 'function') {
    try {
      finalData = encrypt(finalData);
    } catch (e) {
      console.warn("Encryption failed, saving raw JSON");
    }
  }
  return finalData;
}

/**
 * 1. التنزيل الإجباري للنسخة كملف JSON حقيقي
 */
export async function downloadBackup(): Promise<void> {
  try {
    const finalData = await generateBackupData();
    const fileName = `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`;
    
    // إنشاء ملف حقيقي بصيغة JSON
    const blob = new Blob([finalData], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // أمر إجباري للتنزيل
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // تنظيف الذاكرة
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);

    toast.success('تم تنزيل النسخة الاحتياطية بنجاح كملف JSON ✓');
  } catch (error) {
    console.error('Download Error:', error);
    toast.error('حدث خطأ أثناء تنزيل النسخة الاحتياطية');
  }
}

/**
 * 2. فتح قائمة المشاركة الأصلية للهاتف
 */
export async function shareBackup(): Promise<void> {
  try {
    const finalData = await generateBackupData();
    const fileName = `Ledger-Backup-${new Date().toISOString().split('T')[0]}.json`;
    
    const file = new File([finalData], fileName, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'نسخة احتياطية - دفتر الحسابات',
        text: 'ملف النسخة الاحتياطية (JSON) لبيانات التطبيق.'
      });
      toast.success('تم فتح قائمة المشاركة ✓');
    } else {
      toast.error('جهازك لا يدعم المشاركة المباشرة، سيتم التنزيل بدلاً من ذلك.');
      await downloadBackup();
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error('Share Error:', error);
      toast.error('فشلت المشاركة، جاري التنزيل بدلاً من ذلك...');
      await downloadBackup();
    }
  }
}

/**
 * ⭐ التعديل المنقذ: إرجاع دالة التصدير القديمة عشان Vercel ما يضرب (Build Error)
 * أي ملف قديم بيحاول يستدعي exportBackup هيشتغل بدون مشاكل
 */
export async function exportBackup(): Promise<void> {
  return downloadBackup();
}

/**
 * 3. استيراد النسخة الاحتياطية (يستقبل JSON فقط)
 */
export async function importBackup(file: File): Promise<{ clients: number; transactions: number }> {
  try {
    let text = await file.text();
    let decrypted = text;
    
    if (typeof decrypt === 'function') {
      try {
        decrypted = decrypt(text);
      } catch (decryptError) {
        console.warn('Decryption failed, trying raw data:', decryptError);
        decrypted = text;
      }
    }

    if (!decrypted || !decrypted.includes('clients')) {
      throw new Error('الملف غير صالح أو مفتاح التشفير خاطئ');
    }

    const data = JSON.parse(decrypted) as { clients: Client[]; transactions: Transaction[] };

    if (!Array.isArray(data.clients) || !Array.isArray(data.transactions)) {
      throw new Error('صيغة البيانات غير صحيحة');
    }

    const db = await openDB(DB_NAME, DB_VERSION);
    const txClear = db.transaction(['clients', 'transactions'], 'readwrite');
    
    await Promise.all([
      txClear.objectStore('clients').clear(),
      txClear.objectStore('transactions').clear()
    ]);
    await txClear.done;

    const txInsert = db.transaction(['clients', 'transactions'], 'readwrite');
    
    const clientPromises = (data.clients || []).map(c => 
      txInsert.objectStore('clients').put(c)
    );
    const transactionPromises = (data.transactions || []).map(t => 
      txInsert.objectStore('transactions').put(t)
    );

    await Promise.all([...clientPromises, ...transactionPromises]);
    await txInsert.done;

    return { 
      clients: data.clients?.length || 0, 
      transactions: data.transactions?.length || 0 
    };
  } catch (error) {
    console.error('Import Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'فشل استرجاع البيانات. تأكد من صحة الملف.';
    throw new Error(errorMessage);
  }
}

export async function cleanOldBackups(): Promise<void> {
  // للتنظيف المستقبلي
}

export async function scheduleAutoBackup(intervalMinutes: number = 60): Promise<void> {
  try {
    const db = await openDB(DB_NAME, DB_VERSION);
    await db.put('settings', { key: 'autoBackupInterval', value: intervalMinutes.toString() });

    setInterval(async () => {
      try {
        await downloadBackup();
        console.log('Auto backup completed');
      } catch (error) {
        console.error('Auto backup failed:', error);
      }
    }, intervalMinutes * 60 * 1000);

    toast.success(`✓ تم تفعيل التنزيل التلقائي كل ${intervalMinutes} دقيقة`);
  } catch (error) {
    console.error('Schedule error:', error);
  }
}
