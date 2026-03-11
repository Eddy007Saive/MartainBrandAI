import { cn } from '../lib/utils';

export const SectionBlock = ({ title, icon: Icon, children, className }) => {
  return (
    <div className={cn(
      "bg-slate-900/40 border border-white/5 rounded-xl backdrop-blur-sm p-6",
      className
    )}>
      <div className="flex items-center gap-3 mb-6">
        {Icon && <Icon className="w-5 h-5 text-[#5B6CFF]" />}
        <h2 className="text-lg font-semibold text-white font-sora">{title}</h2>
      </div>
      {children}
    </div>
  );
};
