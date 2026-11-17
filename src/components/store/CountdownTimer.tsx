import { useEffect, useState } from 'react';
import { toPersianDigits } from '../../lib/jalali';

export default function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, new Date(endsAt).getTime() - Date.now()));

  useEffect(() => {
    const target = new Date(endsAt).getTime();
    const tick = () => setRemainingMs(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (remainingMs <= 0) return null;

  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const pad = (n: number) => toPersianDigits(String(n).padStart(2, '0'));

  return (
    <span className="tabular-nums text-xs font-bold text-brandDark dark:text-teal-300" dir="ltr">
      {days > 0 ? `${toPersianDigits(days)}d ` : ''}
      {pad(hours)}:{pad(mins)}:{pad(secs)}
    </span>
  );
}
