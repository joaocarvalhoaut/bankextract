import { Mail, MessageSquare, PencilLine, Phone, ToggleLeft, ToggleRight, Trash2, User, UserPlus, X } from 'lucide-react';

export default function RepresentanteModal({ modalData, companyName, onClose, onChange, onSave, onDelete }) {
  if (!modalData) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-slate-900/60 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              {modalData.modo === 'novo' ? <UserPlus size={18} /> : <PencilLine size={18} />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-50">
                {modalData.modo === 'novo' ? 'Novo representante' : 'Editar representante'}
              </h3>
              <p className="text-xs text-slate-500">{companyName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block text-xs font-medium text-slate-200">
            <span className="mb-1.5 flex items-center gap-1.5">
              <User size={12} /> Nome
            </span>
            <input
              value={modalData.rep.nome}
              onChange={(event) => onChange('nome', event.target.value)}
              className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-200">
              <span className="mb-1.5 flex items-center gap-1.5">
                <Phone size={12} /> Telefone
              </span>
              <input
                value={modalData.rep.telefone}
                onChange={(event) => onChange('telefone', event.target.value)}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>
            <label className="block text-xs font-medium text-slate-200">
              <span className="mb-1.5 flex items-center gap-1.5">
                <Mail size={12} /> E-mail
              </span>
              <input
                value={modalData.rep.email}
                onChange={(event) => onChange('email', event.target.value)}
                className="w-full rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-slate-200">
            <span className="mb-1.5 flex items-center gap-1.5">
              <MessageSquare size={12} /> Observações
            </span>
            <textarea
              value={modalData.rep.observacao}
              onChange={(event) => onChange('observacao', event.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-700 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
            />
          </label>

          <button
            onClick={() => onChange('ativo', !modalData.rep.ativo)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-700 px-4 py-3 text-left hover:bg-slate-800/40"
          >
            <div>
              <p className="text-sm font-medium text-slate-50">Representante ativo</p>
              <p className="text-xs text-slate-500">Inativos continuam visíveis, mas marcados.</p>
            </div>
            {modalData.rep.ativo ? (
              <ToggleRight className="text-emerald-600" size={32} />
            ) : (
              <ToggleLeft className="text-slate-300" size={32} />
            )}
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-slate-700 bg-slate-800/40 px-5 py-4">
          {modalData.modo === 'editar' ? (
            <button
              onClick={() => onDelete(modalData.rep.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} /> Excluir
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-200">
              Cancelar
            </button>
            <button onClick={onSave} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              {modalData.modo === 'novo' ? 'Cadastrar e selecionar' : 'Salvar alteracoes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
