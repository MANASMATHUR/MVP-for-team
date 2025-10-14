import { useState } from 'react';

interface AdjusterProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
}

export function Adjuster({ value, onChange, min = 0 }: AdjusterProps) {
  const [temp, setTemp] = useState('');

  const commitChange = (delta: number) => {
    const next = Math.max(min, value + delta);
    onChange(next);
  };

  const commitDirect = () => {
    const parsed = parseInt(temp, 10);
    if (!Number.isNaN(parsed)) {
      onChange(Math.max(min, parsed));
      setTemp('');
    }
  };

  return (
    <div className="inline-flex items-center gap-1">
      <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={() => commitChange(-1)} aria-label="Decrease">
        −
      </button>
      <div className="w-10 text-center tabular-nums">{value}</div>
      <button className="px-2 py-1 rounded border hover:bg-gray-50" onClick={() => commitChange(1)} aria-label="Increase">
        +
      </button>
      <input
        className="ml-2 w-14 rounded border px-2 py-1"
        inputMode="numeric"
        placeholder="set"
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={commitDirect}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitDirect();
        }}
      />
    </div>
  );
}


