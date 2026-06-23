/**
 * En-tête de page cohérent pour tout le dashboard (design system).
 * Usage : <PageHeader icon={Sparkles} title="Studio IA" subtitle="..." actions={<Button/>} />
 */
export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center shadow-lg shadow-[#5B6CFF]/20 flex-shrink-0">
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white font-sora truncate">{title}</h1>
          {subtitle && <p className="text-[13px] sm:text-sm text-slate-400 font-inter mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center flex-wrap gap-2 sm:flex-shrink-0">{actions}</div>}
    </div>
  );
}

export default PageHeader;
