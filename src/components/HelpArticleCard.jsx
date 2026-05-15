import { ArrowRight, BookOpenText } from 'lucide-react';

export default function HelpArticleCard({ article, onOpenTab, compact = false }) {
  if (!article) return null;

  return (
    <article id={`help-article-${article.id}`} className={`rounded-2xl border border-slate-700 bg-slate-900/60 shadow-soft ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
            {article.category}
          </span>
          <h3 className="mt-3 text-base font-semibold text-slate-50">{article.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{article.description}</p>
        </div>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-800/60 text-slate-500">
          <BookOpenText size={18} />
        </div>
      </div>

      {compact ? null : (
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {article.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => onOpenTab?.(article.actionTab)}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800/60"
        >
          Abrir tela
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}
