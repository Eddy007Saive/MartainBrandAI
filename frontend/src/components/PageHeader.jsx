/**
 * En-tête de page cohérent pour tout le dashboard (design system).
 * Usage : <PageHeader icon={Sparkles} title="Studio IA" subtitle="..." actions={<Button/>} />
 */
export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#5B6CFF] to-[#8A6CFF] flex items-center justify-center shadow-lg shadow-[#5B6CFF]/20 flex-shrink-0">
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white font-sora">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400 font-inter mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

export default PageHeader;
