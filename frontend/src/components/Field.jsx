import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/utils';

export const Field = ({
  label,
  name,
  value,
  onChange,
  type = 'text',
  placeholder,
  readOnly = false,
  hasValue = false,
  className,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  
  const displayPlaceholder = isPassword && hasValue ? '••••••••' : placeholder;
  
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={name} className="text-sm font-medium text-slate-300 font-inter">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type={isPassword && !showPassword ? 'password' : 'text'}
          value={value || ''}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={displayPlaceholder}
          readOnly={readOnly}
          data-testid={`field-${name}`}
          className={cn(
            "bg-slate-950/50 border-slate-800 focus:border-[#5B6CFF] focus:ring-1 focus:ring-[#5B6CFF] text-slate-200 placeholder:text-slate-500 font-inter",
            readOnly && "opacity-60 cursor-not-allowed",
            isPassword && "pr-10"
          )}
        />
        {isPassword && (
          <button
            type="button"
            data-testid={`toggle-${name}`}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};
