import { Input } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/utils';

export const ColorField = ({ label, name, value, onChange, className }) => {
  const handleColorChange = (e) => {
    onChange(name, e.target.value);
  };
  
  const handleHexChange = (e) => {
    let hex = e.target.value;
    if (!hex.startsWith('#')) {
      hex = '#' + hex;
    }
    if (/^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
      onChange(name, hex);
    }
  };
  
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium text-slate-300 font-inter">
        {label}
      </Label>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="color"
            value={value || '#000000'}
            onChange={handleColorChange}
            data-testid={`color-picker-${name}`}
            className="w-12 h-10 rounded-lg border-2 border-slate-700 cursor-pointer bg-transparent"
          />
        </div>
        <Input
          type="text"
          value={value || ''}
          onChange={handleHexChange}
          placeholder="#000000"
          data-testid={`color-hex-${name}`}
          className="flex-1 bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 font-mono text-sm"
        />
        <div
          className="w-10 h-10 rounded-lg border-2 border-slate-700"
          style={{ backgroundColor: value || '#000000' }}
          data-testid={`color-preview-${name}`}
        />
      </div>
    </div>
  );
};
