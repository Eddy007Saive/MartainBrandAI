import { useState } from 'react';
import { Eye, EyeOff, Info } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
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
  hint,
  className,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  const displayPlaceholder = isPassword && hasValue ? '••••••••' : placeholder;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={name} className="text-sm font-medium text-slate-300 font-inter">
          {label}
        </Label>
        {hint && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-help transition-colors flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent
                className="max-w-xs bg-slate-800 border border-slate-700 text-slate-200 text-xs leading-relaxed whitespace-pre-line"
                side="top"
              >
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
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
