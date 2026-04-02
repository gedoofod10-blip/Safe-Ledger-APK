import { useState, useRef, useEffect } from 'react';

type Rating = 'excellent' | 'average' | 'poor';

interface ClientRatingProps {
  rating?: Rating;
  onChange: (rating: Rating) => void;
}

const ratingConfig: Record<Rating, { color: string; label: string }> = {
  excellent: { color: 'hsl(142, 60%, 40%)', label: 'أخضر' },
  average: { color: '#eab308', label: 'أصفر' },
  poor: { color: 'hsl(0, 72%, 51%)', label: 'أحمر' },
};

const ClientRating = ({ rating, onChange }: ClientRatingProps) => {
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowPicker(false);
    };
    if (showPicker) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="w-5 h-5 rounded-full border-2 border-white/80 shadow-sm transition-all hover:scale-110 active:scale-95"
        style={{
          backgroundColor: rating ? ratingConfig[rating].color : 'hsl(var(--muted-foreground))',
        }}
      />

      {showPicker && (
        <>
          {/* خلفية مغبشة خفيفة عشان تركز على القائمة */}
          <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[9998]" onClick={() => setShowPicker(false)} />
          
          {/* القائمة في منتصف الشاشة تماماً */}
          <div 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border rounded-3xl shadow-2xl p-3 z-[9999] animate-in fade-in zoom-in duration-200 min-w-[200px]" 
            dir="rtl"
          >
            <p className="text-xs text-muted-foreground px-4 py-2 mb-1 font-bold text-center border-b border-border/50">
              اختر لون الحالة
            </p>
            <div className="flex justify-around gap-2 mt-4 mb-2 px-2">
              {(['excellent', 'average', 'poor'] as Rating[]).map(r => (
                <button
                  key={r}
                  onClick={() => { onChange(r); setShowPicker(false); }}
                  className={`w-12 h-12 rounded-full transition-all active:scale-90 ${rating === r ? 'ring-4 ring-offset-2 ring-primary' : 'opacity-80 hover:opacity-100'}`}
                  style={{ backgroundColor: ratingConfig[r].color }}
                  title={ratingConfig[r].label}
                />
              ))}
            </div>
            <button 
              onClick={() => setShowPicker(false)}
              className="w-full mt-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              إلغاء
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ClientRating;
