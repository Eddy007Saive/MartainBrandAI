import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { BLOCS, resume, sorties } from './catalogue';

/** Un bloc du canevas : entrée en haut (sauf le déclencheur), une sortie par branche en bas. */
function NoeudBloc({ data, selected }) {
  const { t } = useTranslation();
  const { kind, config, label } = data;
  const def = BLOCS[kind] || BLOCS.end;
  const Icone = def.icon;
  const outs = sorties(kind, config, t);
  return (
    <div
      className={`w-[230px] rounded-xl border bg-[#0f172a] shadow-lg transition-colors ${selected ? 'border-[#8A6CFF] ring-2 ring-[#8A6CFF]/30' : 'border-white/10'}`}
      data-testid={`bloc-${kind}`}
    >
      {kind !== 'trigger' && (
        <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-slate-400 !border-2 !border-[#0f172a]" />
      )}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="w-6 h-6 rounded-md grid place-items-center shrink-0" style={{ background: `${def.color}22` }}>
          <Icone className="w-3.5 h-3.5" style={{ color: def.color }} />
        </span>
        <span className="text-[12.5px] font-semibold text-white truncate font-sora">{label || t(`auto.bloc.${kind}`)}</span>
      </div>
      <p className="px-3 pt-1 pb-3 text-[11.5px] text-slate-400 font-inter leading-snug line-clamp-2">{resume(kind, config, t)}</p>
      {outs.length > 1 && (
        <div className="flex border-t border-white/[0.06]">
          {outs.map((o) => (
            <span key={o.id} className="flex-1 text-center text-[10px] text-slate-500 py-1 truncate px-1">{o.label}</span>
          ))}
        </div>
      )}
      {outs.map((o, i) => (
        <Handle
          key={o.id ?? 'out'}
          type="source"
          id={o.id ?? undefined}
          position={Position.Bottom}
          style={{ left: `${((i + 0.5) / outs.length) * 100}%`, background: def.color }}
          className="!w-3 !h-3 !border-2 !border-[#0f172a]"
          title={o.label}
        >
          <span className="sr-only">{o.label}</span>
        </Handle>
      ))}
    </div>
  );
}

export default memo(NoeudBloc);
