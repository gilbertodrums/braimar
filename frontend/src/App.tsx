import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Shield, ChevronRight, ArrowLeft, Check, X, LogOut, Delete,
  Users, CreditCard, Plus, Pencil, Trash2, Calendar, Phone,
  IdCard, Clock, Banknote, FileDown, ChevronDown, Mail, Fingerprint, RefreshCw
} from 'lucide-react';
import jsPDF from 'jspdf';

// ─── TIPOS ────────────────────────────────────────────────────────────────────
interface Colaborador {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  telefono: string;
  correo: string;
  fecha_ingreso: string;
  tipo_turno: 'completo' | 'medio';
  sueldo: number; // Sueldo base
  bono_alimentacion?: number;
  bonos?: number;
}

interface Pago {
  id: string;
  colaborador_id: string;
  desde: string;
  hasta: string;
  total: number;
  fecha_generado: string;
  hora_generado: string;
}

interface HoraExtra {
  id: string;
  colaborador_id: string;
  fecha: string;
  horas: number;
  hora_inicio?: string;
  hora_fin?: string;
  fecha_generado?: string;
  hora_generado?: string;
}

interface FinanzasPago {
  nombre: string;
  total: number;
  fecha_generado: string;
  hora_generado: string;
}

interface FinanzasPeriodo {
  desde: string;
  hasta: string;
  total: number;
  cantidad: number;
  pagos: FinanzasPago[];
}

type View =
  | 'menu'
  | 'change-pin'
  | 'mis-colaboradores'
  | 'colaborador-form'
  | 'pagos-realizados'
  | 'generar-pago'
  | 'finanzas'
  | 'horas-extras';

// ─── FORMULARIO COLABORADOR ───────────────────────────────────────────────────
function ColaboradorForm({ inicial, onGuardar, onCancelar, bcvRate }: {
  inicial?: Colaborador;
  onGuardar: (data: Omit<Colaborador, 'id'>) => Promise<void>;
  onCancelar: () => void;
  bcvRate: number | null;
}) {
  const [form, setForm] = useState({
    nombre:            inicial?.nombre            ?? '',
    apellido:          inicial?.apellido          ?? '',
    cedula:            inicial?.cedula            ?? '',
    telefono:          inicial?.telefono          ?? '',
    correo:            inicial?.correo            ?? '',
    fecha_ingreso:     inicial?.fecha_ingreso     ?? '',
    tipo_turno:        inicial?.tipo_turno        ?? 'completo' as 'completo' | 'medio',
    sueldo:            String(inicial?.sueldo            ?? '120'),
    bono_alimentacion: String(inicial?.bono_alimentacion ?? '40'),
    bonos:             String(inicial?.bonos             ?? '120'),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState('');

  const apellidoRef  = useRef<HTMLInputElement>(null);
  const cedulaRef    = useRef<HTMLInputElement>(null);
  const telefonoRef  = useRef<HTMLInputElement>(null);
  const correoRef    = useRef<HTMLInputElement>(null);
  const sueldoRef    = useRef<HTMLInputElement>(null);
  const bonoAlimRef  = useRef<HTMLInputElement>(null);
  const bonosRef     = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleTurnoChange = (t: 'completo' | 'medio') => {
    if (form.tipo_turno === t) return;
    
    const s = parseFloat(form.sueldo) || 0;
    const ba = parseFloat(form.bono_alimentacion) || 0;
    const b = parseFloat(form.bonos) || 0;
    
    let newS = s;
    let newBa = ba;
    let newB = b;
    
    if (t === 'medio') {
      newS = s / 2;
      newBa = ba / 2;
      newB = b / 2;
    } else if (t === 'completo') {
      newS = s * 2;
      newBa = ba * 2;
      newB = b * 2;
    }
    
    setForm(f => ({
      ...f,
      tipo_turno: t,
      sueldo: String(newS),
      bono_alimentacion: String(newBa),
      bonos: String(newB)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim() || !form.apellido.trim()) { setError('Nombre y apellido son obligatorios'); return; }
    if (!form.cedula.trim())  { setError('La cédula es obligatoria'); return; }
    if (!form.fecha_ingreso)  { setError('La fecha de ingreso es obligatoria'); return; }
    setGuardando(true);
    try   {
      await onGuardar({
        ...form,
        sueldo: parseFloat(form.sueldo) || 0,
        bono_alimentacion: parseFloat(form.bono_alimentacion) || 0,
        bonos: parseFloat(form.bonos) || 0,
      });
    }
    catch { setError('Error al guardar. Intenta de nuevo.'); setGuardando(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <FormInput label="Nombre"   value={form.nombre}   onChange={v => set('nombre', v)}   placeholder="Juan"
          onEnter={() => apellidoRef.current?.focus()} />
        <FormInput label="Apellido" value={form.apellido} onChange={v => set('apellido', v)} placeholder="Pérez"
          inputRef={apellidoRef} onEnter={() => cedulaRef.current?.focus()} />
      </div>
      <FormInput label="Cédula" value={form.cedula} onChange={v => set('cedula', v.replace(/\D/g, ''))}
        placeholder="12345678" inputMode="numeric" icon={<IdCard size={12} className="text-white/40" />}
        inputRef={cedulaRef} onEnter={() => telefonoRef.current?.focus()} />
      <FormInput label="Teléfono" value={form.telefono} onChange={v => set('telefono', v.replace(/\D/g, ''))}
        placeholder="04141234567" inputMode="numeric" icon={<Phone size={12} className="text-white/40" />}
        inputRef={telefonoRef} onEnter={() => correoRef.current?.focus()} />
      <FormInput label="Correo electrónico" value={form.correo} onChange={v => set('correo', v)}
        placeholder="ejemplo@correo.com" icon={<Mail size={12} className="text-white/40" />}
        inputRef={correoRef} onEnter={() => sueldoRef.current?.focus()} />

      {/* Fecha de ingreso */}
      <div className="flex flex-col gap-1">
        <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
          <Calendar size={10} /> Fecha de ingreso
        </label>
        <input type="date" value={form.fecha_ingreso}
          onChange={e => set('fecha_ingreso', e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          data-empty={!form.fecha_ingreso}
          placeholder="dd/mm/aaaa"
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150 [color-scheme:dark]"
        />
      </div>
      {/* Sueldo base */}
      <div className="flex flex-col gap-1">
        <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
          <Banknote size={10} /> Sueldo base (USD)
        </label>
        <div className="relative">
          <input
            ref={sueldoRef}
            type="text" inputMode="decimal" value={form.sueldo}
            onChange={e => set('sueldo', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            enterKeyHint="next"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bonoAlimRef.current?.focus(); } }}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150"
          />
        </div>
        {(() => {
          const usd = parseFloat(form.sueldo);
          if (!usd || usd <= 0) return null;
          const bs = bcvRate ? usd * bcvRate : null;
          return (
            <div className="flex items-center gap-2 mt-1 px-0.5">
              <span className="text-white/40 text-[10px] font-medium">
                $ {usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
              {bs !== null && (
                <>
                  <span className="text-white/20 text-[9px]">≈</span>
                  <span className="text-white/70 text-[10px]">
                    Bs. {bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* Bono de alimentación */}
      <div className="flex flex-col gap-1">
        <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
          <Banknote size={10} /> Bono de alimentación (USD)
        </label>
        <div className="relative">
          <input
            ref={bonoAlimRef}
            type="text" inputMode="decimal" value={form.bono_alimentacion}
            onChange={e => set('bono_alimentacion', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            enterKeyHint="next"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bonosRef.current?.focus(); } }}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150"
          />
        </div>
        {(() => {
          const usd = parseFloat(form.bono_alimentacion);
          if (!usd || usd <= 0) return null;
          const bs = bcvRate ? usd * bcvRate : null;
          return (
            <div className="flex items-center gap-2 mt-1 px-0.5">
              <span className="text-white/40 text-[10px] font-medium">
                $ {usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
              {bs !== null && (
                <>
                  <span className="text-white/20 text-[9px]">≈</span>
                  <span className="text-white/70 text-[10px]">
                    Bs. {bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* Bonos */}
      <div className="flex flex-col gap-1">
        <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
          <Banknote size={10} /> Bonos (USD)
        </label>
        <div className="relative">
          <input
            ref={bonosRef}
            type="text" inputMode="decimal" value={form.bonos}
            onChange={e => set('bonos', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bonosRef.current?.blur(); } }}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150"
          />
        </div>
        {(() => {
          const usd = parseFloat(form.bonos);
          if (!usd || usd <= 0) return null;
          const bs = bcvRate ? usd * bcvRate : null;
          return (
            <div className="flex items-center gap-2 mt-1 px-0.5">
              <span className="text-white/40 text-[10px] font-medium">
                $ {usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </span>
              {bs !== null && (
                <>
                  <span className="text-white/20 text-[9px]">≈</span>
                  <span className="text-white/70 text-[10px]">
                    Bs. {bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </div>
          );
        })()}
      </div>
      {/* Tipo de turno */}
      <div className="flex flex-col gap-1">
        <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
          <Clock size={10} /> Tipo de turno
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['completo', 'medio'] as const).map(t => (
            <button key={t} type="button" onClick={() => handleTurnoChange(t)}
              className={`py-2.5 rounded-lg text-[11px] font-semibold border transition-all duration-200 ${
                t === 'completo'
                  ? form.tipo_turno === t
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/40 scale-[1.02]'
                    : 'bg-blue-600/15 border-blue-500/30 text-blue-200/70 hover:bg-blue-600/25 hover:border-blue-400/50'
                  : form.tipo_turno === t
                    ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-900/40 scale-[1.02]'
                    : 'bg-amber-500/15 border-amber-400/30 text-amber-200/70 hover:bg-amber-500/25 hover:border-amber-400/50'
              }`}>
              {t === 'completo' ? 'Turno completo' : 'Medio turno'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-red-300 text-[11px] bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">
          <X size={11} /><span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancelar}
          className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold border border-white/20 text-white/60 bg-white/8 hover:bg-white/15 hover:text-white/80 active:scale-[0.98] transition-all duration-150">
          Cancelar
        </button>
        <button type="submit" disabled={guardando}
          className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white border border-blue-500 shadow-md shadow-blue-900/40 disabled:opacity-40 active:scale-[0.98] transition-all duration-150">
          {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Añadir'}
        </button>
      </div>
    </form>
  );
}

function FormInput({ label, value, onChange, placeholder, inputMode, icon, inputRef, onEnter, isLast }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  icon?: React.ReactNode;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onEnter?: () => void;
  isLast?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-white/50 text-[10px] px-0.5">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center justify-center">{icon}</span>}
        <input
          ref={inputRef}
          type="text" inputMode={inputMode} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          enterKeyHint={isLast ? 'done' : 'next'}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
          className={`w-full bg-white/10 border border-white/20 rounded-lg py-2.5 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150 ${icon ? 'pl-8 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  );
}

// ─── VISTA: MIS COLABORADORES ─────────────────────────────────────────────────
function MisColaboradoresView({ onBack, onAbrirFormulario, colaboradores, onEliminar, onEditar, cargando, bcvRateForCard }: {
  onBack: () => void; onAbrirFormulario: (c?: Colaborador) => void;
  colaboradores: Colaborador[]; onEliminar: (id: string) => void;
  onEditar: (c: Colaborador) => void; cargando: boolean;
  bcvRateForCard: number | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <>
      <div className="pt-10 pb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft size={13} /><span className="text-[11px]">Volver</span>
        </button>
        <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Pago a colaboradores</p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-light text-white">Colaboradores</h1>
          <button onClick={() => onAbrirFormulario()}
            className="flex items-center gap-1 bg-white text-gray-800 text-[10px] font-medium px-3 py-1.5 rounded-full hover:bg-white/90 active:scale-95 transition-all">
            <Plus size={11} /> Añadir
          </button>
        </div>
      </div>

      {cargando && (
        <div className="flex flex-col gap-3 pb-16">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl px-5 py-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2 flex-1">
                  <div className="h-3 bg-white/15 rounded-full w-3/4" />
                  <div className="h-2.5 bg-white/10 rounded-full w-1/2" />
                </div>
                <div className="h-8 w-16 bg-white/10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!cargando && colaboradores.length === 0 && (
        <div className="flex flex-col items-center justify-center mt-10 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <Users size={24} className="text-white/25" />
          </div>
          <p className="text-white/40 text-[11px] leading-relaxed">No hay colaboradores aún.<br />Presiona <span className="text-white/60 font-medium">+ Añadir</span> para comenzar.</p>
        </div>
      )}

      {!cargando && (
        <div className="flex flex-col gap-3 pb-20">
          {colaboradores.map(c => {
            const sueldoBase = c.sueldo || 0;
            const bonoAlim = c.bono_alimentacion ?? 40;
            const bonosVal = c.bonos ?? 120;
            const total = sueldoBase + bonoAlim + bonosVal;
            const totalBs = bcvRateForCard ? total * bcvRateForCard : null;

            return (
              <div key={c.id}
                className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden transition-all duration-200 hover:bg-white/[0.13] hover:border-white/25 hover:shadow-lg">

                {/* Main row */}
                <div className="flex items-stretch">

                  {/* Left accent bar by shift type */}
                  <div className={`w-[3px] shrink-0 ${
                    c.tipo_turno === 'completo'
                      ? 'bg-gradient-to-b from-blue-400/70 to-blue-600/50'
                      : 'bg-gradient-to-b from-amber-400/70 to-amber-600/50'
                  }`} />

                  {/* Content */}
                  <div className="flex-1 flex items-center justify-between gap-3 px-4 py-3">

                    {/* Left: name, then badge on its own row, then cédula */}
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      {/* Row 1: Name — full width, truncated */}
                      <span className="text-white font-semibold text-[12.5px] leading-snug truncate">
                        {c.nombre} {c.apellido}
                      </span>

                      {/* Row 2: Badge — ALWAYS fixed position, never inline with name */}
                      <span className={`self-start text-[7.5px] font-bold uppercase tracking-widest px-2 py-[2px] rounded-full ${
                        c.tipo_turno === 'completo'
                          ? 'bg-blue-400/20 text-blue-200 border border-blue-400/30'
                          : 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                      }`}>
                        {c.tipo_turno === 'completo' ? 'Turno completo' : 'Medio turno'}
                      </span>

                      {/* Row 3: Cédula + correo */}
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-white/35 text-[10px] flex items-center gap-1">
                          <IdCard size={8} className="shrink-0" />
                          {c.cedula}
                        </span>
                        {c.correo && (
                          <span className="text-white/30 text-[10px] flex items-center gap-1 truncate max-w-[140px]">
                            <Mail size={8} className="shrink-0" />
                            {c.correo}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: salary on top, actions on bottom */}
                    <div className="flex flex-col items-end justify-between self-stretch py-0.5 shrink-0">
                      <div className="text-right">
                        <p className="text-white font-bold text-[13px] leading-tight tabular-nums">
                          $ {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {totalBs && (
                          <p className="text-white/40 text-[9px] font-medium mt-0.5 tabular-nums">
                            ≈ Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0">
                        <button onClick={() => onEditar(c)}
                          className="w-6 h-6 flex items-center justify-center rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-all active:scale-90">
                          <Pencil size={10} />
                        </button>
                        <button onClick={() => setConfirmDelete(c.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-full text-white/30 hover:text-red-300 hover:bg-red-400/15 transition-all active:scale-90">
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confirm delete row */}
                {confirmDelete === c.id && (
                  <div className="border-t border-white/10 bg-red-500/5 px-4 py-2.5 flex items-center justify-between gap-2">
                    <span className="text-white/55 text-[10px]">¿Eliminar a <span className="text-white/80 font-medium">{c.nombre}</span>?</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setConfirmDelete(null)}
                        className="text-[9.5px] px-2.5 py-1.5 rounded-lg border border-white/20 text-white/60 hover:bg-white/10 transition-all">
                        Cancelar
                      </button>
                      <button onClick={() => { onEliminar(c.id); setConfirmDelete(null); }}
                        className="text-[9.5px] px-2.5 py-1.5 rounded-lg bg-red-500/80 text-white font-medium hover:bg-red-500 transition-all active:scale-95">
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── GENERAR PAGO ─────────────────────────────────────────────────────────────
function GenerarPagoView({ onBack, bcvRate }: { onBack: () => void; bcvRate: number | null }) {
  const [{ defaultDesde, defaultHasta }] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    let dFrom, dTo;
    if (d <= 15) {
      dFrom = new Date(y, m - 1, 16);
      dTo = new Date(y, m, 0);
    } else {
      dFrom = new Date(y, m, 1);
      dTo = new Date(y, m, 15);
    }
    const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { defaultDesde: format(dFrom), defaultHasta: format(dTo) };
  });

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedId, setSelectedId]       = useState('');
  const [desde, setDesde]                 = useState(defaultDesde);
  const [hasta, setHasta]                 = useState(defaultHasta);
  const [bono, setBono]                   = useState('');
  const [generando, setGenerando]         = useState(false);
  const [error, setError]                 = useState('');
  const [enviando, setEnviando]           = useState(false);
  const [exitoEnvio, setExitoEnvio]       = useState<'ok' | 'error' | null>(null);
  const [horasExtras, setHorasExtras]     = useState<HoraExtra[]>([]);

  useEffect(() => {
    fetch('/colaboradores', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setColaboradores)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetch('/horas-extras', { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .then(setHorasExtras)
        .catch(() => {});
    }
  }, [selectedId]);

  const colaborador = colaboradores.find(c => c.id === selectedId) ?? null;
  const sueldoQuincenalUSD = colaborador ? (colaborador.sueldo ?? 0) / 2 : 0;
  const sueldoQuincenalBs = sueldoQuincenalUSD * (bcvRate ?? 0);

  const bonoAlimQuincenalUSD = colaborador ? (colaborador.bono_alimentacion ?? 40) / 2 : 0;
  const bonoAlimQuincenalBs = bonoAlimQuincenalUSD * (bcvRate ?? 0);

  const bonosQuincenalUSD = colaborador ? (colaborador.bonos ?? 120) / 2 : 0;
  const bonosQuincenalBs = bonosQuincenalUSD * (bcvRate ?? 0);

  // Filtrar horas extras del colaborador en el periodo especificado
  const horasExtrasFiltradas = horasExtras.filter(h => {
    if (h.colaborador_id !== selectedId) return false;
    if (!h.fecha) return false;
    return h.fecha >= desde && h.fecha <= hasta;
  });

  const totalHorasExtras = horasExtrasFiltradas.reduce((sum, h) => sum + (h.horas || 0), 0);
  const horasJornada = colaborador?.tipo_turno === 'medio' ? 4 : 8;
  const valorHoraUSD = colaborador ? ((colaborador.sueldo / 30 / horasJornada) * 1.5) : 0;
  const montoHorasExtrasUSD = totalHorasExtras * valorHoraUSD;
  const montoHorasExtrasBs = montoHorasExtrasUSD * (bcvRate ?? 0);

  const bonoNum         = parseFloat(bono) || 0;
  const totalPagar      = sueldoQuincenalBs + bonoAlimQuincenalBs + bonosQuincenalBs + montoHorasExtrasBs + bonoNum;

  const formatBs = (n: number) =>
    'Bs. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatFechaLarga = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`;
  };

  const handleGenerarPDF = async () => {
    setError(''); setExitoEnvio(null);
    if (!colaborador)  { setError('Selecciona un colaborador');       return; }
    if (!desde || !hasta) { setError('Completa el período de pago'); return; }
    if (!bcvRate) { setError('No se pudo obtener la tasa BCV. Necesaria para calcular el pago.'); return; }
    setGenerando(true);

    // Capturar snapshot antes del posible reset
    const colSnap    = colaborador;
    const desdeSnap  = desde;
    const hastaSnap  = hasta;
    const totalSnap  = totalPagar;

    try {
      // ── CARGAR LOGO ──────────────────────────────────────────────────────
      let logoDataUrl: string | null = null;
      try {
        const logoResp = await fetch('/logo-horizontal-white.png');
        if (logoResp.ok) {
          const blob = await logoResp.blob();
          logoDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch { /* si falla, continúa sin logo */ }

      const doc    = new jsPDF({ unit: 'mm', format: 'a4' });
      const W      = doc.internal.pageSize.getWidth();   // 210
      const margin = 18;
      const col1   = margin;
      // const col2   = 110;

      // ── CABECERA AZUL ──────────────────────────────────────────────────
      doc.setFillColor(0, 97, 255);
      doc.roundedRect(0, 0, W, 44, 0, 0, 'F');

      // Logo PNG transparente en esquina superior derecha — sin bordes ni diferencia de color
      const logoW = 55;   // ancho en mm (logo horizontal ~3:1 ratio)
      const logoH = 18;   // alto en mm
      const logoX = W - logoW - 6;
      const logoY = 13;   // centrado verticalmente en la cabecera de 44mm
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoW, logoH);
      }

      // Texto centrado en el espacio a la izquierda del logo
      const textAreaW = logoX - 4;
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('RECIBO DE PAGO', textAreaW / 2, 13, { align: 'center' });

      doc.setFontSize(11);
      doc.text('LA CASA DEL ENCAJE', textAreaW / 2, 21, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('RIF: V-08053912-2', textAreaW / 2, 29, { align: 'center' });
      doc.text('Carrera 9 entre calles 20 y 21. Guanare, Edo Portuguesa.', textAreaW / 2, 35.5, { align: 'center' });

      // ── SECCIÓN: DATOS DEL COLABORADOR ────────────────────────────────
      let y = 54;
      doc.setTextColor(30, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setFillColor(240, 243, 255);
      doc.roundedRect(margin, y - 5, W - margin * 2, 7, 1.5, 1.5, 'F');
      doc.setTextColor(0, 97, 255);
      doc.text('DATOS DEL COLABORADOR', col1 + 3, y, {});
      y += 9;

      const labelW = 42;
      const addRow = (label: string, value: string) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 100, 110);
        doc.text(label, col1, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(20, 20, 20);
        doc.text(value, col1 + labelW, y);
        y += 7;
      };

      const hoy = new Date();
      const fechaHoy = `${hoy.getDate()} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][hoy.getMonth()]} de ${hoy.getFullYear()}`;

      addRow('Nombre:', `${colaborador.nombre} ${colaborador.apellido}`);
      addRow('Cedula:', colaborador.cedula);
      addRow('Periodo de pago:', `${formatFechaLarga(desde)} al ${formatFechaLarga(hasta)}`);
      addRow('Tasa BCV:', bcvRate ? `Bs. ${bcvRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $1 USD` : 'No disponible');

      // ── LÍNEA DIVISORA ─────────────────────────────────────────────────
      y += 2;
      doc.setDrawColor(220, 220, 230);
      doc.setLineWidth(0.4);
      doc.line(margin, y, W - margin, y);
      y += 8;

      // ── SECCIÓN: CONCEPTOS ─────────────────────────────────────────────
      doc.setFillColor(240, 243, 255);
      doc.roundedRect(margin, y - 5, W - margin * 2, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 97, 255);
      doc.text('CONCEPTOS', col1 + 3, y);
      y += 10;

      // Cabecera de la tabla de conceptos
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 130);
      doc.text('Concepto', col1, y);
      doc.text('Tipo', col1 + 100, y);
      doc.text('Monto', W - margin, y, { align: 'right' });
      y += 3;
      doc.setDrawColor(220, 220, 230);
      doc.setLineWidth(0.3);
      doc.line(margin, y, W - margin, y);
      y += 7;

      // Tabla de conceptos
      const addConcepto = (concepto: string, tipo: string, monto: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(bold ? 10 : 50, bold ? 10 : 50, bold ? 10 : 60);
        doc.text(concepto, col1, y);
        if (tipo) {
          doc.text(tipo, col1 + 100, y);
        }
        doc.setTextColor(bold ? 0 : 40, bold ? 80 : 40, bold ? 0 : 40);
        doc.text(monto, W - margin, y, { align: 'right' });
        y += 8;
      };

      addConcepto(`Sueldo Quincenal ($${sueldoQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`, 'Salarial', formatBs(sueldoQuincenalBs));
      addConcepto(`Bono de Alimentación Quincenal ($${bonoAlimQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`, 'No salarial', formatBs(bonoAlimQuincenalBs));
      addConcepto(`Bonos Quincenal ($${bonosQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`, 'No salarial', formatBs(bonosQuincenalBs));
      if (totalHorasExtras > 0) {
        addConcepto(`Horas Extras (${totalHorasExtras} hs x $${valorHoraUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`, 'No salarial', formatBs(montoHorasExtrasBs));
      }
      if (bonoNum > 0) {
        addConcepto('Ajuste manual / Bono extra', 'No salarial', formatBs(bonoNum));
      }

      // Línea total
      y += 1;
      doc.setDrawColor(0, 97, 255);
      doc.setLineWidth(0.5);
      doc.line(margin, y, W - margin, y);
      y += 6;
      const totalUSD = bcvRate ? (totalPagar / bcvRate) : 0;
      addConcepto(`Total de ingresos quincenal ($${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`, '', formatBs(totalPagar), true);

      // ── LÍNEA DIVISORA ─────────────────────────────────────────────────
      y += 3;
      doc.setDrawColor(220, 220, 230);
      doc.setLineWidth(0.4);
      doc.line(margin, y, W - margin, y);
      y += 10;

      // ── CONFORMIDAD ────────────────────────────────────────────────────
      doc.setFillColor(240, 243, 255);
      doc.roundedRect(margin, y - 5, W - margin * 2, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(0, 97, 255);
      doc.text('CONFORMIDAD', col1 + 3, y);
      y += 10;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      const conformidadText = `Recibo hoy ${fechaHoy} la cantidad de ${formatBs(totalPagar)} por concepto de salario quincenal correspondiente al periodo indicado.`;
      const lines = doc.splitTextToSize(conformidadText, W - margin * 2);
      doc.text(lines, col1, y);
      y += lines.length * 6 + 14;

      // ── FIRMAS ─────────────────────────────────────────────────────────
      const firmaY  = y + 10;
      const firma1X = margin + 20;
      const firma2X = W - margin - 20;

      doc.setDrawColor(80, 80, 100);
      doc.setLineWidth(0.4);
      doc.line(margin, firmaY, firma1X * 2 - margin, firmaY);
      doc.line(firma2X - (firma2X - margin - 20), firmaY, W - margin, firmaY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 100);
      doc.text('Firma Empresa', firma1X, firmaY + 6, { align: 'center' });
      doc.text('Firma Trabajador', firma2X, firmaY + 6, { align: 'center' });

      // ── PIE DE PÁGINA ──────────────────────────────────────────────────
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(180, 180, 190);
      doc.text(`Generado el ${fechaHoy}  ·  La Casa del Encaje`, W / 2, 287, { align: 'center' });

      // ── GUARDAR PAGO EN SERVIDOR ────────────────────────────────────────
      const nombreArchivo = `recibo_${colSnap.nombre.toLowerCase()}_${colSnap.apellido.toLowerCase()}_${desdeSnap}_${hastaSnap}.pdf`.replace(/\s+/g, '_');
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      const resPago = await fetch('/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          colaborador_id: colSnap.id,
          desde: desdeSnap,
          hasta: hastaSnap,
          total: totalSnap,
          pdf_base64: pdfBase64,
        }),
      });

      if (!resPago.ok) {
        const errorData = await resPago.json().catch(() => ({}));
        throw new Error(errorData.detail || 'No se pudo guardar el registro de pago en el servidor. Asegúrate de tener SUPABASE_SERVICE_KEY configurado en tu servidor backend.');
      }

      // ── GUARDAR LOCALMENTE (DESCARGAR PDF) ────────────────────────────────
      doc.save(nombreArchivo);

      // ── RESET CAMPOS ───────────────────────────────────────────────────
      setSelectedId('');
      setDesde(defaultDesde);
      setHasta(defaultHasta);
      setBono('');

      // ── ENVIAR CORREO ──────────────────────────────────────────────────
      if (colSnap.correo) {
        setEnviando(true);
        try {
          const r = await fetch('/enviar-recibo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              email_destinatario: colSnap.correo,
              nombre_colaborador: `${colSnap.nombre} ${colSnap.apellido}`,
              periodo: `${desdeSnap} al ${hastaSnap}`,
              pdf_base64: pdfBase64,
            }),
          });
          setExitoEnvio(r.ok ? 'ok' : 'error');
        } catch {
          setExitoEnvio('error');
        } finally {
          setEnviando(false);
          setTimeout(() => setExitoEnvio(null), 5000);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Error al generar el PDF. Intenta de nuevo.');
      console.error(e);
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <div className="pt-10 pb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft size={13} /><span className="text-[11px]">Volver</span>
        </button>
        <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Pago a colaboradores</p>
        <h1 className="text-xl font-light text-white">Generar pago</h1>
      </div>

      <div className="flex flex-col gap-3 pb-16">

        {/* Colaborador */}
        <div className="flex flex-col gap-1">
          <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
            <Users size={10} /> Colaborador
          </label>
          <div className="relative">
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="w-full appearance-none bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-[11px] text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150 [color-scheme:dark]"
            >
              <option value="" disabled className="bg-gray-800">Selecciona un colaborador…</option>
              {colaboradores.map(c => (
                <option key={c.id} value={c.id} className="bg-gray-800">
                  {c.nombre} {c.apellido}
                </option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          </div>
        </div>

        {/* Resumen del colaborador seleccionado */}
        {colaborador && (
          <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-white/40 text-[10px] flex items-center gap-0.5"><IdCard size={9} />{colaborador.cedula}</span>
            <span className="text-white/40 text-[10px] flex items-center gap-0.5">
              <Banknote size={9} />Sueldo base: $ {(colaborador.sueldo ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
            <span className="text-white/40 text-[10px] flex items-center gap-0.5">
              <Banknote size={9} />Bono alim.: $ {(colaborador.bono_alimentacion ?? 40).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
            <span className="text-white/40 text-[10px] flex items-center gap-0.5">
              <Banknote size={9} />Bonos: $ {(colaborador.bonos ?? 120).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
            <span className="text-white/40 text-[10px] flex items-center gap-0.5">
              <Clock size={9} />{colaborador.tipo_turno === 'completo' ? 'Turno completo' : 'Medio turno'}
            </span>
          </div>
        )}

        {/* Período de pago */}
        <div className="flex flex-col gap-1">
          <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
            <Calendar size={10} /> Período de pago
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-white/30 text-[9px] px-0.5">Desde</span>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                data-empty={!desde} placeholder="dd/mm/aaaa"
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all [color-scheme:dark]" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-white/30 text-[9px] px-0.5">Hasta</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                min={desde}
                data-empty={!hasta} placeholder="dd/mm/aaaa"
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all [color-scheme:dark]" />
            </div>
          </div>
        </div>

        {/* Bono */}
        <div className="flex flex-col gap-1">
          <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
            <Banknote size={10} /> Bono de alimentación, asistencia y puntualidad (Bs.)
          </label>
          <input type="text" inputMode="decimal" value={bono}
            onChange={e => setBono(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all" />
        </div>

        {/* Resumen previo del recibo */}
        {colaborador && desde && hasta && (
          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-col gap-1.5">
            <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Resumen del recibo</p>
            <div className="flex justify-between text-[10px]">
              <span className="text-white/50">Sueldo quincenal base ($ {sueldoQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)</span>
              <span className="text-white/80">{formatBs(sueldoQuincenalBs)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-white/50">Bono alimentación quincenal ($ {bonoAlimQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)</span>
              <span className="text-white/80">{formatBs(bonoAlimQuincenalBs)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-white/50">Bonos quincenal ($ {bonosQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)</span>
              <span className="text-white/80">{formatBs(bonosQuincenalBs)}</span>
            </div>
            {totalHorasExtras > 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-white/50">Horas extras ({totalHorasExtras} hs x $ {valorHoraUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)</span>
                <span className="text-white/80">{formatBs(montoHorasExtrasBs)}</span>
              </div>
            )}
            {bonoNum > 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-white/50">Bono extra (ajuste manual)</span>
                <span className="text-white/80">{formatBs(bonoNum)}</span>
              </div>
            )}
            <div className="h-px bg-white/10 my-0.5" />
            <div className="flex justify-between text-[11px]">
              <span className="text-white font-medium">Total a pagar</span>
              <span className="text-white font-semibold">{formatBs(totalPagar)}</span>
            </div>
            {bcvRate && (
              <span className="text-white/30 text-[9px] mt-0.5">
                ≈ $ {(totalPagar / bcvRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD · Tasa BCV {bcvRate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 text-red-300 text-[11px] bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">
            <X size={11} /><span>{error}</span>
          </div>
        )}
        {enviando && (
          <div className="flex items-center gap-1.5 text-blue-200 text-[11px] bg-blue-500/20 border border-blue-400/30 rounded-lg px-3 py-2">
            <Mail size={11} className="animate-pulse" /><span>Enviando recibo por correo…</span>
          </div>
        )}
        {exitoEnvio === 'ok' && (
          <div className="flex items-center gap-1.5 text-green-300 text-[11px] bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-2">
            <Check size={11} /><span>Recibo enviado por correo correctamente</span>
          </div>
        )}
        {exitoEnvio === 'error' && (
          <div className="flex items-center gap-1.5 text-amber-300 text-[11px] bg-amber-500/20 border border-amber-400/30 rounded-lg px-3 py-2">
            <X size={11} /><span>No se pudo enviar el correo. Verifica la configuración del servidor.</span>
          </div>
        )}

        {/* Botón generar */}
        <button
          onClick={handleGenerarPDF}
          disabled={generando || enviando}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-[12px] bg-white text-gray-800 disabled:opacity-40 hover:bg-white/90 active:scale-[0.98] transition-all duration-150 mt-1"
        >
          <FileDown size={14} />
          {generando ? 'Generando PDF…' : 'Generar recibo en PDF'}
        </button>

      </div>
    </>
  );
}

// ─── PAGOS REALIZADOS ─────────────────────────────────────────────────────────
function PagosRealizadosView({ onBack }: { onBack: () => void }) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedId, setSelectedId]       = useState('');
  const [pagos, setPagos]                 = useState<Pago[]>([]);
  const [cargando, setCargando]           = useState(false);
  const [abriendo, setAbriendo]           = useState<string | null>(null);
  const [eliminando, setEliminando]       = useState<string | null>(null);

  useEffect(() => {
    fetch('/colaboradores', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setColaboradores)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) { setPagos([]); return; }
    setCargando(true);
    fetch(`/pagos?colaborador_id=${selectedId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setPagos)
      .catch(() => setPagos([]))
      .finally(() => setCargando(false));
  }, [selectedId]);

  const formatFecha = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`;
  };

  const verPDF = async (pago: Pago) => {
    setAbriendo(pago.id);
    try {
      const r = await fetch(`/pagos/${pago.id}/pdf`, { credentials: 'include' });
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } finally {
      setAbriendo(null);
    }
  };

  const handleEliminarPago = async (pagoId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este registro de pago? Esta acción no se puede deshacer y borrará también el PDF almacenado en la nube.')) return;
    setEliminando(pagoId);
    try {
      const res = await fetch(`/pagos/${pagoId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setPagos(prev => prev.filter(p => p.id !== pagoId));
      } else {
        alert('Error al eliminar el registro de pago. Intenta nuevamente.');
      }
    } catch {
      alert('Error de conexión al intentar eliminar el registro de pago.');
    } finally {
      setEliminando(null);
    }
  };

  return (
    <>
      <div className="pt-10 pb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft size={13} /><span className="text-[11px]">Volver</span>
        </button>
        <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Pago a colaboradores</p>
        <h1 className="text-xl font-light text-white">Pagos realizados</h1>
      </div>

      <div className="flex flex-col gap-3 pb-16">
        {/* Selector colaborador */}
        <div className="flex flex-col gap-1">
          <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
            <Users size={10} /> Colaborador
          </label>
          <div className="relative">
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
              className="w-full appearance-none bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-[11px] text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150 [color-scheme:dark]">
              <option value="" disabled className="bg-gray-800">Selecciona un colaborador…</option>
              {colaboradores.map(c => (
                <option key={c.id} value={c.id} className="bg-gray-800">{c.nombre} {c.apellido}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          </div>
        </div>

        {/* Lista de pagos */}
        {cargando && <p className="text-white/50 text-[11px] text-center mt-4">Cargando…</p>}

        {!cargando && selectedId && pagos.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-8 gap-2 text-center">
            <FileDown size={26} className="text-white/20" />
            <p className="text-white/40 text-[11px]">No hay pagos registrados<br />para este colaborador.</p>
          </div>
        )}

        {pagos.map((p, i) => (
          <div key={p.id} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white/30 text-[9px] font-semibold uppercase tracking-widest">#{pagos.length - i}</span>
                  <span className="text-white text-[11px] font-medium">
                    {formatFecha(p.desde)} → {formatFecha(p.hasta)}
                  </span>
                </div>
                <span className="text-white/40 text-[10px] flex items-center gap-0.5">
                  <Calendar size={9} /> {formatFecha(p.fecha_generado)} · {p.hora_generado}
                </span>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={() => verPDF(p)}
                  disabled={abriendo === p.id || eliminando === p.id}
                  className="flex items-center gap-1.5 bg-white/12 hover:bg-white/22 border border-white/20 hover:border-white/30 text-white text-[10px] font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 active:scale-95">
                  <FileDown size={11} />
                  {abriendo === p.id ? 'Abriendo…' : 'Ver PDF'}
                </button>
                <button
                  onClick={() => handleEliminarPago(p.id)}
                  disabled={eliminando === p.id}
                  className="flex items-center gap-1.5 bg-red-500/15 hover:bg-red-500/35 border border-red-500/25 hover:border-red-400/50 text-red-300 hover:text-red-200 text-[10px] font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 active:scale-95"
                  title="Eliminar registro de pago">
                  {eliminando === p.id
                    ? <><span className="w-[11px] h-[11px] border-2 border-red-300/40 border-t-red-300 rounded-full animate-spin" /></>
                    : <Trash2 size={11} />}
                  {eliminando === p.id ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── CONTROL DE FINANZAS ─────────────────────────────────────────────────────
function ControlFinanzasView({ onBack, bcvRate }: { onBack: () => void; bcvRate: number | null }) {
  const [periodos, setPeriodos]     = useState<FinanzasPeriodo[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [expandido, setExpandido]   = useState<string | null>(null);

  const cargarFinanzas = () => {
    setCargando(true);
    fetch('/finanzas', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(setPeriodos)
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargarFinanzas(); }, []);

  const fmtBs = (n: number) =>
    'Bs. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtFecha = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d)} ${meses[parseInt(m)-1]} ${y}`;
  };

  const totalGeneral = periodos.reduce((s, p) => s + p.total, 0);

  return (
    <>
      <div className="pt-10 pb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft size={13} /><span className="text-[11px]">Volver</span>
        </button>
        <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Pago a colaboradores</p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-light text-white">Control de finanzas</h1>
          <button
            onClick={cargarFinanzas}
            disabled={cargando}
            className="flex items-center gap-1 text-white/40 hover:text-white/80 transition-colors disabled:opacity-40 text-[10px]">
            <RefreshCw size={12} className={cargando ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-16">
        {cargando && <p className="text-white/50 text-[11px] text-center mt-8">Cargando…</p>}

        {!cargando && periodos.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-10 gap-2 text-center">
            <Banknote size={28} className="text-white/20" />
            <p className="text-white/40 text-[11px]">Aún no hay pagos registrados.</p>
          </div>
        )}

        {/* Resumen general */}
        {periodos.length > 0 && (
          <div className="bg-white/15 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Total acumulado</p>
              <p className="text-white text-[15px] font-semibold">{fmtBs(totalGeneral)}</p>
              {bcvRate && (
                <p className="text-white/40 text-[10px] mt-0.5">
                  ≈ $ {(totalGeneral / bcvRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Quincenas</p>
              <p className="text-white text-[15px] font-light">{periodos.length}</p>
            </div>
          </div>
        )}

        {/* Lista por quincena */}
        {periodos.map(p => {
          const key = `${p.desde}|${p.hasta}`;
          const abierto = expandido === key;
          return (
            <div key={key} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden">
              {/* Cabecera del período */}
              <button
                onClick={() => setExpandido(abierto ? null : key)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                <div className="text-left">
                  <p className="text-white text-[11px] font-medium">
                    {fmtFecha(p.desde)} → {fmtFecha(p.hasta)}
                  </p>
                  <p className="text-white/40 text-[10px] mt-0.5">
                    {p.cantidad} {p.cantidad === 1 ? 'colaborador' : 'colaboradores'}
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="text-right">
                    <p className="text-white font-semibold text-[12px]">{fmtBs(p.total)}</p>
                    {bcvRate && (
                      <p className="text-white/40 text-[9px]">
                        ≈ $ {(p.total / bcvRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  <ChevronDown size={13} className={`text-white/30 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {/* Detalle por colaborador */}
              {abierto && (
                <div className="border-t border-white/10 px-4 py-2 flex flex-col gap-0">
                  {p.pagos.map((pg, i) => (
                    <div key={i} className={`flex items-center justify-between py-2 ${i < p.pagos.length - 1 ? 'border-b border-white/5' : ''}`}>
                      <span className="text-white/70 text-[11px] truncate flex-1 min-w-0 pr-2">{pg.nombre}</span>
                      <span className="text-white/80 text-[11px] font-medium shrink-0">{fmtBs(pg.total)}</span>
                    </div>
                  ))}
                  {/* Línea total del período */}
                  <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/15">
                    <span className="text-white/50 text-[10px] uppercase tracking-wide">Total quincena</span>
                    <span className="text-white font-semibold text-[12px]">{fmtBs(p.total)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── VISTA: HORAS EXTRAS ──────────────────────────────────────────────────────
function HorasExtrasView({ onBack, bcvRate }: { onBack: () => void; bcvRate: number | null }) {
  const getVenezuelaDate = () => {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * -4));
  };

  const vetToday = getVenezuelaDate();
  const [selectedDate, setSelectedDate] = useState<Date>(vetToday);
  const [currentYear, setCurrentYear] = useState(vetToday.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(vetToday.getMonth()); // 0-11
  
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [horasExtras, setHorasExtras] = useState<HoraExtra[]>([]);
  const [cargando, setCargando] = useState(true);
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<HoraExtra | null>(null);
  
  // Form states inside modal
  const [colabId, setColabId] = useState('');
  const [horasVal, setHorasVal] = useState('1');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [errorModal, setErrorModal] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Selected collaborator for quincena summary dropdown
  const [summaryColabId, setSummaryColabId] = useState('');

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const colabRes = await fetch('/colaboradores', { credentials: 'include' });
      if (colabRes.ok) {
        const colabData = await colabRes.json();
        setColaboradores(colabData);
        if (colabData.length > 0) {
          setColabId(colabData[0].id);
          setSummaryColabId(colabData[0].id);
        }
      }
      const extrasRes = await fetch('/horas-extras', { credentials: 'include' });
      if (extrasRes.ok) {
        setHorasExtras(await extrasRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Calendar logic
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
  
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const diasSemana = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  // Helper to format date key YYYY-MM-DD
  const formatDateKey = (y: number, m: number, d: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  const selectedDateKey = selectedDate ? formatDateKey(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()) : '';

  // Get overtime entries for selected day
  const entriesForDay = horasExtras.filter(h => h.fecha === selectedDateKey);

  // Check if a day has any overtime entries
  const dayHasEntries = (d: number) => {
    const key = formatDateKey(currentYear, currentMonth, d);
    return horasExtras.some(h => h.fecha === key);
  };

  // Calculate quincena range for selectedDate
  const getQuincenaRange = (date: Date) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    let desde, hasta;
    if (d <= 15) {
      desde = new Date(y, m, 1);
      hasta = new Date(y, m, 15);
    } else {
      desde = new Date(y, m, 16);
      hasta = new Date(y, m + 1, 0); // last day of month
    }
    return { desde, hasta };
  };

  const { desde: qDesde, hasta: qHasta } = getQuincenaRange(selectedDate);
  const qDesdeKey = formatDateKey(qDesde.getFullYear(), qDesde.getMonth(), qDesde.getDate());
  const qHastaKey = formatDateKey(qHasta.getFullYear(), qHasta.getMonth(), qHasta.getDate());

  // Calculate total quincenal hours for summaryColabId
  const getQuincenalHours = (colabId: string) => {
    if (!colabId) return 0;
    return horasExtras
      .filter(h => h.colaborador_id === colabId && h.fecha >= qDesdeKey && h.fecha <= qHastaKey)
      .reduce((sum, h) => sum + (h.horas || 0), 0);
  };

  // Format date display
  const formatFechaDisplay = (date: Date) => {
    return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
  };

  const formatFechaQuincena = (date: Date) => {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  // Auto calculate hours from range
  useEffect(() => {
    if (isRange && horaInicio && horaFin) {
      const [h1, m1] = horaInicio.split(':').map(Number);
      const [h2, m2] = horaFin.split(':').map(Number);
      let diffMins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diffMins < 0) diffMins += 24 * 60; // night shift crossover
      const hours = parseFloat((diffMins / 60).toFixed(2));
      setHorasVal(String(hours));
    }
  }, [isRange, horaInicio, horaFin]);

  const handleOpenAdd = () => {
    setEditEntry(null);
    if (colaboradores.length > 0) {
      setColabId(colaboradores[0].id);
    }
    setHorasVal('1');
    setHoraInicio('');
    setHoraFin('');
    setIsRange(false);
    setErrorModal('');
    setModalOpen(true);
  };

  const handleOpenEdit = (entry: HoraExtra) => {
    setEditEntry(entry);
    setColabId(entry.colaborador_id);
    setHorasVal(String(entry.horas));
    if (entry.hora_inicio && entry.hora_fin) {
      setIsRange(true);
      setHoraInicio(entry.hora_inicio);
      setHoraFin(entry.hora_fin);
    } else {
      setIsRange(false);
      setHoraInicio('');
      setHoraFin('');
    }
    setErrorModal('');
    setModalOpen(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorModal('');
    const h = parseFloat(horasVal);
    if (!colabId) { setErrorModal('Selecciona un colaborador'); return; }
    if (isNaN(h) || h <= 0) { setErrorModal('Ingresa una cantidad válida de horas'); return; }
    
    setGuardando(true);
    
    const payload = {
      colaborador_id: colabId,
      fecha: selectedDateKey,
      horas: h,
      hora_inicio: isRange ? horaInicio || null : null,
      hora_fin: isRange ? horaFin || null : null
    };

    try {
      let res;
      if (editEntry) {
        res = await fetch(`/horas-extras/${editEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/horas-extras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        const item = await res.json();
        if (editEntry) {
          setHorasExtras(prev => prev.map(x => x.id === editEntry.id ? item : x));
        } else {
          setHorasExtras(prev => [...prev, item]);
        }
        setModalOpen(false);
      } else {
        setErrorModal('Error al registrar. Intenta nuevamente.');
      }
    } catch {
      setErrorModal('Error de conexión con el servidor.');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (id: string) => {
    try {
      const res = await fetch(`/horas-extras/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setHorasExtras(prev => prev.filter(x => x.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const formatBs = (n: number) =>
    'Bs. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <div className="pt-10 pb-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors mb-4">
          <ArrowLeft size={13} /><span className="text-[11px]">Volver</span>
        </button>
        <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Pago a colaboradores</p>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-light text-white">Horas extras</h1>
          <button onClick={handleOpenAdd} disabled={colaboradores.length === 0}
            className="flex items-center gap-1 bg-white text-gray-800 text-[10px] font-medium px-3 py-1.5 rounded-full hover:bg-white/90 active:scale-95 transition-all">
            <Plus size={11} /> Registrar
          </button>
        </div>
      </div>

      {/* ── PANEL DE ACUMULADOS POR QUINCENA ── */}
      {cargando ? (
        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 mb-4 flex flex-col justify-center items-center h-[142px] animate-pulse">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-[10px] text-white/50 font-medium tracking-wider uppercase">Cargando resumen quincenal...</span>
          </div>
        </div>
      ) : colaboradores.length > 0 ? (
        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-white/50 text-[9px] uppercase tracking-widest font-semibold">Resumen Quincenal ({formatFechaQuincena(qDesde)} al {formatFechaQuincena(qHasta)})</span>
            <div className="relative shrink-0">
              <select
                value={summaryColabId}
                onChange={e => setSummaryColabId(e.target.value)}
                className="appearance-none bg-white/10 border border-white/15 rounded-lg pl-2.5 pr-6 py-1 text-[10px] text-white focus:outline-none focus:bg-white/20 transition-all [color-scheme:dark]"
              >
                {colaboradores.map(c => (
                  <option key={c.id} value={c.id} className="bg-gray-800">{c.nombre} {c.apellido}</option>
                ))}
              </select>
              <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            </div>
          </div>

          {(() => {
            const colab = colaboradores.find(c => c.id === summaryColabId);
            const horasJornada = colab?.tipo_turno === 'medio' ? 4 : 8;
            const valorHoraUSD = colab ? ((colab.sueldo / 30 / horasJornada) * 1.5) : 0;
            const valorHoraBs = bcvRate ? (valorHoraUSD * bcvRate) : 0;
            const acumuladoUSD = getQuincenalHours(summaryColabId) * valorHoraUSD;
            const acumuladoBs = acumuladoUSD * (bcvRate || 0);

            return (
              <>
                <div className="flex items-center justify-between pt-1.5 border-t border-white/5">
                  <div>
                    <p className="text-white/40 text-[9px]">Horas acumuladas</p>
                    <p className="text-white text-base font-semibold">{getQuincenalHours(summaryColabId)} hs</p>
                    <p className="text-white/50 text-[9px] mt-0.5">
                      Total: $ {acumuladoUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/40 text-[9px]">Valor quincenal estimado</p>
                    <p className="text-white text-[14px] font-semibold text-emerald-300">
                      ≈ {formatBs(acumuladoBs)}
                    </p>
                    <p className="text-white/20 text-[9px]">con referencia BCV</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5 bg-white/5 -mx-4 -mb-4 px-4 py-2.5 rounded-b-2xl">
                  <div>
                    <p className="text-white/40 text-[9px] uppercase tracking-wide">Valor de 1 hora extra</p>
                    <p className="text-white text-[11px] font-medium mt-0.5">
                      $ {valorHoraUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </p>
                  </div>
                  {bcvRate && (
                    <div className="text-right">
                      <p className="text-white/40 text-[9px]">Equivalente BCV</p>
                      <p className="text-emerald-300 text-[11px] font-medium mt-0.5">
                        ≈ {formatBs(valorHoraBs)}
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      ) : null}

      {/* ── CALENDARIO MENSUAL ── */}
      <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 mb-4 select-none">
        {/* Cabecera del mes */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all">
            <ArrowLeft size={14} />
          </button>
          <span className="text-white font-medium text-xs tracking-wider uppercase">
            {meses[currentMonth]} {currentYear}
          </span>
          <button onClick={nextMonth} className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all rotate-180">
            <ArrowLeft size={14} />
          </button>
        </div>

        {/* Días de la semana */}
        <div className="grid grid-cols-7 gap-y-2 mb-2 text-center">
          {diasSemana.map((d, i) => (
            <span key={i} className="text-white/30 text-[9px] font-bold uppercase">{d}</span>
          ))}
        </div>

        {/* Cuadrícula de días */}
        <div className="grid grid-cols-7 gap-y-1.5 text-center">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-${i}`} className="h-8" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = vetToday.getDate() === day && vetToday.getMonth() === currentMonth && vetToday.getFullYear() === currentYear;
            const isSelected = selectedDate && selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth && selectedDate.getFullYear() === currentYear;
            const hasData = dayHasEntries(day);

            return (
              <button
                key={`day-${day}`}
                onClick={() => setSelectedDate(new Date(currentYear, currentMonth, day))}
                className="relative h-8 flex flex-col items-center justify-center focus:outline-none group active:scale-90 transition-all"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium transition-all ${
                  isSelected 
                    ? 'bg-white text-gray-800 font-bold shadow-md' 
                    : isToday 
                      ? 'border border-white/40 text-white font-semibold' 
                      : 'text-white/80 hover:bg-white/5'
                }`}>
                  {day}
                </div>
                {/* Indicador de registro */}
                {hasData && (
                  <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                    isSelected ? 'bg-gray-800' : 'bg-blue-400 animate-pulse'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── LISTA DE REGISTROS DEL DÍA SELECCIONADO ── */}
      <div className="flex flex-col gap-2 pb-16">
        <p className="text-white/40 text-[9px] uppercase tracking-widest font-bold px-1 mb-1">
          Registros del {selectedDate ? formatFechaDisplay(selectedDate) : ''}
        </p>

        {cargando && (
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3 h-[45px] flex items-center justify-center animate-pulse">
            <span className="text-[10px] text-white/40 tracking-wider">Cargando registros...</span>
          </div>
        )}

        {!cargando && entriesForDay.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 bg-white/5 border border-white/10 rounded-2xl text-center">
            <Clock size={20} className="text-white/20 mb-1.5" />
            <p className="text-white/30 text-[10px]">No hay horas extras registradas para este día.</p>
          </div>
        )}

        {!cargando && entriesForDay.map(h => {
          const colab = colaboradores.find(c => c.id === h.colaborador_id);
          return (
            <div key={h.id} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-white font-medium text-[11px] truncate">
                  {colab ? `${colab.nombre} ${colab.apellido}` : 'Colaborador eliminado'}
                </p>
                <div className="flex items-center gap-1.5 text-white/40 text-[9px] mt-0.5">
                  <Clock size={8} />
                  <span>{h.horas} {h.horas === 1 ? 'hora' : 'horas'}</span>
                  {h.hora_inicio && h.hora_fin && (
                    <>
                      <span>·</span>
                      <span>({h.hora_inicio} a {h.hora_fin})</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => handleOpenEdit(h)} className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all">
                  <Pencil size={11} />
                </button>
                <button onClick={() => handleEliminar(h.id)} className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-red-300 hover:bg-red-400/15 transition-all">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL: AÑADIR/EDITAR HORA EXTRA ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-0 sm:items-center">
          <form onSubmit={handleGuardar} className="bg-white/20 backdrop-blur-2xl border border-white/30 rounded-t-3xl w-full max-w-sm px-6 pt-5 pb-8 sm:rounded-2xl sm:p-6 sm:m-4 flex flex-col gap-4 animate-pop">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-[14px] font-medium">
                {editEntry ? 'Editar Horas Extras' : 'Registrar Horas Extras'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition-all">
                <X size={14} />
              </button>
            </div>

            {errorModal && (
              <p className="text-red-300 text-[10px] bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">{errorModal}</p>
            )}

            <div className="flex flex-col gap-3">
              {/* Colaborador */}
              <div className="flex flex-col gap-1">
                <label className="text-white/50 text-[9px] px-0.5">Colaborador</label>
                <div className="relative">
                  <select
                    value={colabId}
                    onChange={e => setColabId(e.target.value)}
                    disabled={!!editEntry}
                    className="w-full appearance-none bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all [color-scheme:dark] disabled:opacity-50"
                  >
                    {colaboradores.map(c => (
                      <option key={c.id} value={c.id} className="bg-gray-800">{c.nombre} {c.apellido}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                </div>
              </div>

              {/* Fecha fija info */}
              <div className="flex flex-col gap-0.5 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                <span className="text-white/35 text-[8px] uppercase tracking-wide">Fecha de registro</span>
                <span className="text-white text-[10px] font-medium">{selectedDate ? formatFechaDisplay(selectedDate) : ''}</span>
              </div>

              {/* Rango de tiempo selector */}
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-white/50 text-[9px]">Calcular por rango de hora</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRange(!isRange);
                      if (isRange) { setHoraInicio(''); setHoraFin(''); }
                    }}
                    className={`text-[8.5px] px-2 py-0.5 rounded-full border transition-all ${
                      isRange ? 'bg-white text-gray-800 border-white' : 'border-white/20 text-white/60 hover:bg-white/5'
                    }`}
                  >
                    {isRange ? 'Sí, calcular' : 'No, ingresar manual'}
                  </button>
                </div>

                {isRange ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-white/35 text-[8px] px-0.5">Desde</span>
                      <input
                        type="time"
                        value={horaInicio}
                        onChange={e => setHoraInicio(e.target.value)}
                        required
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[10px] text-white focus:outline-none focus:border-white/50 [color-scheme:dark]"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-white/35 text-[8px] px-0.5">Hasta</span>
                      <input
                        type="time"
                        value={horaFin}
                        onChange={e => setHoraFin(e.target.value)}
                        required
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[10px] text-white focus:outline-none focus:border-white/50 [color-scheme:dark]"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Cantidad de Horas */}
              <div className="flex flex-col gap-1">
                <label className="text-white/50 text-[9px] px-0.5">Cantidad de horas</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={horasVal}
                  onChange={e => setHorasVal(e.target.value.replace(/[^0-9.]/g, ''))}
                  disabled={isRange}
                  placeholder="1.0"
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all disabled:opacity-60"
                />
                {isRange && horaInicio && horaFin && (
                  <span className="text-emerald-300 text-[8px] font-medium px-0.5">✓ Calculado automáticamente</span>
                )}
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 text-[11px] hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="flex-1 py-2.5 rounded-xl bg-white text-gray-800 font-semibold text-[11px] disabled:opacity-40 hover:bg-white/90 active:scale-95 transition-all"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({ onLogout, bcvRate, biometriaHabilitada, onDesactivarBiometria }: {
  onLogout: () => void;
  bcvRate: number | null;
  biometriaHabilitada: boolean;
  onDesactivarBiometria: () => void;
}) {
  const [view, setView]                   = useState<View>('menu');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargandoColab, setCargandoColab] = useState(false);
  const [editando, setEditando]           = useState<Colaborador | undefined>();
  const [currentPin, setCurrentPin]       = useState('');
  const [newPin, setNewPin]               = useState('');
  const [confirmPin, setConfirmPin]       = useState('');
  const [submitState, setSubmitState]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg]           = useState('');

  const fetchColaboradores = async () => {
    setCargandoColab(true);
    try { const r = await fetch('/colaboradores', { credentials: 'include' }); if (r.ok) setColaboradores(await r.json()); }
    finally { setCargandoColab(false); }
  };

  const handleGuardarColaborador = async (data: Omit<Colaborador, 'id'>) => {
    if (editando) {
      const r = await fetch(`/colaboradores/${editando.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setColaboradores(cs => cs.map(c => c.id === editando.id ? updated : c));
    } else {
      const r = await fetch('/colaboradores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
      const nuevo = await r.json();
      setColaboradores(cs => [...cs, nuevo]);
    }
    setEditando(undefined);
    setView('mis-colaboradores');
  };

  const handleEliminar = async (id: string) => {
    try {
      const res = await fetch(`/colaboradores/${id}`, { 
        method: 'DELETE', 
        credentials: 'include' 
      });
      if (res.ok) {
        setColaboradores(cs => cs.filter(c => c.id !== id));
      } else {
        alert('Error al eliminar el colaborador. Intenta nuevamente.');
      }
    } catch (e) {
      console.error(e);
      alert('Error de conexión al eliminar el colaborador.');
    }
  };

  const abrirFormulario = (c?: Colaborador) => { setEditando(c); setView('colaborador-form'); };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    if (newPin !== confirmPin) { setErrorMsg('Los PINs nuevos no coinciden'); return; }
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) { setErrorMsg('El nuevo PIN debe tener 6 dígitos'); return; }
    setSubmitState('loading');
    try {
      const res = await fetch('/change-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }) });
      if (res.ok) {
        setSubmitState('success');
        setTimeout(() => { setSubmitState('idle'); setView('menu'); setCurrentPin(''); setNewPin(''); setConfirmPin(''); }, 2000);
      } else {
        const d = await res.json(); setErrorMsg(d.detail || 'Error al cambiar el PIN');
        setSubmitState('error'); setTimeout(() => setSubmitState('idle'), 2000);
      }
    } catch { setErrorMsg('Error de conexión'); setSubmitState('error'); setTimeout(() => setSubmitState('idle'), 2000); }
  };

  const volverAlMenu = () => { setView('menu'); setCurrentPin(''); setNewPin(''); setConfirmPin(''); setErrorMsg(''); setSubmitState('idle'); setEditando(undefined); };

  const BackBtn = ({ to }: { to?: () => void }) => (
    <button onClick={to ?? volverAlMenu} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors mb-4">
      <ArrowLeft size={13} /><span className="text-[11px]">Volver</span>
    </button>
  );

  return (
    <div className="relative z-10 w-full max-w-sm mx-auto px-4">

      {/* ── MENÚ ── */}
      {view === 'menu' && (
        <>
          <div className="pt-10 pb-4">
            <div className="flex justify-end mb-3">
              <button onClick={onLogout} className="flex items-center gap-1 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full px-3.5 py-1.5 shadow-md text-white/90 hover:text-white transition-all text-[11px] font-bold active:scale-95 duration-150 backdrop-blur-md">
                <LogOut size={12} className="text-white/80" /> Cerrar sesión
              </button>
            </div>
            <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5">Panel de administrador</p>
            <h1 className="text-xl font-light text-white">Bienvenida Braimar</h1>
          </div>

          {/* Seguridad / Contraseña Pill con estilo de vidrio esmerilado y alto contraste */}
          <div className="mb-5">
            <div role="button" tabIndex={0}
              onClick={() => setView('change-pin')}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('change-pin'); } }}
              className="security-btn w-full flex items-center justify-between bg-white/10 hover:bg-white/15 border border-white/20 rounded-full px-5 py-3.5 shadow-lg active:scale-[0.98] transition-all text-white text-[12.5px] font-bold select-none touch-manipulation backdrop-blur-md cursor-pointer outline-none">
              <span className="flex items-center gap-2">
                <Shield size={14} className="text-white/80" />
                Seguridad: Cambiar contraseña
              </span>
              {biometriaHabilitada && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onDesactivarBiometria(); }}
                  className="flex items-center gap-1 bg-[#ffebee]/20 border border-red-400/30 rounded-full px-2.5 py-0.5 text-[9.5px] font-bold text-red-200 active:scale-95 transition-all">
                  <Fingerprint size={10} className="text-red-300" /> Desactivar
                </button>
              )}
              {!biometriaHabilitada && (
                <ChevronRight size={14} className="text-white/50" />
              )}
            </div>
          </div>

          {/* Gestión Operativa (2x2 Grid) */}
          <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2 px-1">Gestión operativa</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            
            {/* Widget 1: Colaboradores */}
            <button onClick={() => { fetchColaboradores(); setView('mis-colaboradores'); }}
              className="flex flex-col items-start p-4 bg-[#e8f0fe] border border-blue-100 rounded-[24px] shadow-sm active:scale-95 transition-all select-none touch-manipulation text-left w-full">
              <div className="w-9 h-9 rounded-full bg-[#0b57d0]/10 flex items-center justify-center mb-3">
                <Users size={18} className="text-[#0b57d0]" />
              </div>
              <span className="text-[13.5px] font-semibold text-[#1f1f1f]">Equipo</span>
              <span className="text-[10px] text-[#5f6368] mt-0.5">Mis colaboradores</span>
            </button>

            {/* Widget 2: Generar Pago */}
            <button onClick={() => setView('generar-pago')}
              className="flex flex-col items-start p-4 bg-[#e6f4ea] border border-green-100 rounded-[24px] shadow-sm active:scale-95 transition-all select-none touch-manipulation text-left w-full">
              <div className="w-9 h-9 rounded-full bg-[#137333]/10 flex items-center justify-center mb-3">
                <CreditCard size={18} className="text-[#137333]" />
              </div>
              <span className="text-[13.5px] font-semibold text-[#1f1f1f]">Generar Pago</span>
              <span className="text-[10px] text-[#5f6368] mt-0.5">Crear recibo PDF</span>
            </button>

            {/* Widget 3: Horas Extras */}
            <button onClick={() => setView('horas-extras')}
              className="flex flex-col items-start p-4 bg-[#fef7e0] border border-yellow-100 rounded-[24px] shadow-sm active:scale-95 transition-all select-none touch-manipulation text-left w-full">
              <div className="w-9 h-9 rounded-full bg-[#b06000]/10 flex items-center justify-center mb-3">
                <Clock size={18} className="text-[#b06000]" />
              </div>
              <span className="text-[13.5px] font-semibold text-[#1f1f1f]">Horas Extras</span>
              <span className="text-[10px] text-[#5f6368] mt-0.5">Control de tiempo</span>
            </button>

            {/* Widget 4: Finanzas */}
            <button onClick={() => setView('finanzas')}
              className="flex flex-col items-start p-4 bg-[#f3e8fd] border border-purple-100 rounded-[24px] shadow-sm active:scale-95 transition-all select-none touch-manipulation text-left w-full">
              <div className="w-9 h-9 rounded-full bg-[#7627bb]/10 flex items-center justify-center mb-3">
                <Banknote size={18} className="text-[#7627bb]" />
              </div>
              <span className="text-[13.5px] font-semibold text-[#1f1f1f]">Finanzas</span>
              <span className="text-[10px] text-[#5f6368] mt-0.5">Balance quincenal</span>
            </button>

          </div>

          {/* Historial (Ancho completo con estilo vidrio, alto contraste y mayor espaciado) */}
          <p className="text-white/40 text-[9.5px] uppercase tracking-[0.2em] font-semibold mt-14 mb-4 px-1">Archivo histórico</p>
          <button onClick={() => setView('pagos-realizados')}
            className="w-full flex items-center gap-6 py-6 px-7 bg-white/10 hover:bg-white/15 border border-white/20 rounded-[24px] shadow-lg active:scale-[0.98] transition-all select-none touch-manipulation text-left mb-20 backdrop-blur-md">
            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0">
              <FileDown size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-bold text-white">Pagos Realizados</p>
              <p className="text-[11.5px] text-white/60 mt-0.5">Historial y eliminación de recibos</p>
            </div>
            <ChevronRight size={18} className="text-white/50 shrink-0" />
          </button>
        </>
      )}

      {/* ── CAMBIAR PIN ── */}
      {view === 'change-pin' && (
        <>
          <div className="pt-10 pb-6">
            <BackBtn />
            <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Seguridad</p>
            <h1 className="text-xl font-light text-white">Cambiar contraseña</h1>
          </div>
          <form onSubmit={handleChangePin} className="flex flex-col gap-3 pb-16">
            <div className="flex flex-col gap-2">
              <PinInput label="PIN actual"          value={currentPin} onChange={setCurrentPin} disabled={submitState === 'loading' || submitState === 'success'} />
              <PinInput label="PIN nuevo"           value={newPin}     onChange={setNewPin}     disabled={submitState === 'loading' || submitState === 'success'} />
              <PinInput label="Confirmar PIN nuevo" value={confirmPin} onChange={setConfirmPin} disabled={submitState === 'loading' || submitState === 'success'} />
            </div>
            {errorMsg && (
              <div className="flex items-center gap-1.5 text-red-300 text-[11px] bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">
                <X size={11} /><span>{errorMsg}</span>
              </div>
            )}
            {submitState === 'success' && (
              <div className="flex items-center gap-1.5 text-green-300 text-[11px] bg-green-500/20 border border-green-400/30 rounded-lg px-3 py-2">
                <Check size={11} /><span>Contraseña actualizada correctamente</span>
              </div>
            )}
            <button type="submit" disabled={submitState === 'loading' || submitState === 'success' || !currentPin || !newPin || !confirmPin}
              className="mt-1 w-full py-3 rounded-xl font-medium text-[11px] bg-white text-gray-800 disabled:opacity-30 hover:bg-white/90 active:scale-[0.98] transition-all duration-150">
              {submitState === 'loading' ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </form>
        </>
      )}

      {/* ── MIS COLABORADORES ── */}
      {view === 'mis-colaboradores' && (
        <MisColaboradoresView onBack={volverAlMenu} onAbrirFormulario={abrirFormulario}
          colaboradores={colaboradores} onEliminar={handleEliminar} onEditar={abrirFormulario}
          cargando={cargandoColab} bcvRateForCard={bcvRate} />
      )}

      {/* ── FORMULARIO COLABORADOR ── */}
      {view === 'colaborador-form' && (
        <>
          <div className="pt-10 pb-4">
            <BackBtn to={() => { setEditando(undefined); setView('mis-colaboradores'); }} />
            <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Colaboradores</p>
            <h1 className="text-xl font-light text-white">{editando ? 'Editar colaborador' : 'Nuevo colaborador'}</h1>
          </div>
          <div className="pb-16">
            <ColaboradorForm inicial={editando} onGuardar={handleGuardarColaborador}
              onCancelar={() => { setEditando(undefined); setView('mis-colaboradores'); }}
              bcvRate={bcvRate} />
          </div>
        </>
      )}

      {/* ── PAGOS REALIZADOS ── */}
      {view === 'pagos-realizados' && (
        <PagosRealizadosView onBack={volverAlMenu} />
      )}

      {/* ── GENERAR PAGO ── */}
      {view === 'generar-pago' && (
        <GenerarPagoView onBack={volverAlMenu} bcvRate={bcvRate} />
      )}

      {/* ── CONTROL DE FINANZAS ── */}
      {view === 'finanzas' && (
        <ControlFinanzasView onBack={volverAlMenu} bcvRate={bcvRate} />
      )}

      {/* ── HORAS EXTRAS ── */}
      {view === 'horas-extras' && (
        <HorasExtrasView onBack={volverAlMenu} bcvRate={bcvRate} />
      )}
    </div>
  );
}

// ─── COMPONENTES AUXILIARES ───────────────────────────────────────────────────
// function SectionCard({ icon, titulo, items }: {
//   icon: React.ReactNode; titulo: string;
//   items: { label: string; icon?: React.ReactNode; onClick: () => void }[];
// }) {
//   return (
//     <div className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-white/15">
//       <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-1.5">
//         {icon}
//         <p className="text-white/40 text-[9px] uppercase tracking-widest">{titulo}</p>
//       </div>
//       {items.map((item, i) => (
//         <button key={i} onClick={item.onClick}
//           className={`w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 active:bg-white/15 transition-colors ${i < items.length - 1 ? 'border-b border-white/10' : ''}`}>
//           <span className="flex items-center gap-2 text-[11px]">{item.icon}{item.label}</span>
//           <ChevronRight size={12} className="text-white/30" />
//         </button>
//       ))}
//     </div>
//   );
// }

// function Placeholder({ texto }: { texto: string }) {
//   return (
//     <div className="flex flex-col items-center justify-center mt-10 gap-2 text-center px-4">
//       <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
//         <Clock size={18} className="text-white/30" />
//       </div>
//       <p className="text-white/40 text-[11px]">{texto}</p>
//     </div>
//   );
// }

const PinInput = ({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (v: string) => void; disabled: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <label className="text-white/50 text-[10px] px-0.5">{label}</label>
    <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))} disabled={disabled} placeholder="••••••"
      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 disabled:opacity-40 transition-all duration-150"
    />
  </div>
);

// ─── BCV BADGE ────────────────────────────────────────────────────────────────
function BcvBadge({ display }: { display: string | null }) {
  if (!display) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 bg-white/80 backdrop-blur-md border border-gray-200 rounded-full px-3 py-1.5 shadow-sm select-none">
      <span className="text-gray-400 text-[9px] uppercase tracking-widest font-medium">BCV</span>
      <span className="text-gray-300 text-[9px]">|</span>
      <span className="text-gray-600 text-[11px] font-medium">Bs.&nbsp;{display}</span>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export default function App() {
  const [passcode, setPasscode]               = useState('');
  const [isError, setIsError]                 = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [bcvRateNum, setBcvRateNum]           = useState<number | null>(null);
  const [bcvDisplay, setBcvDisplay]           = useState<string | null>(null);

  // ── BIOMETRÍA ──
  const [biometriaHabilitada, setBiometriaHabilitada] = useState(
    () => localStorage.getItem('biometria_habilitada') === '1'
  );
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [biometriaCargando, setBiometriaCargando]     = useState(false);
  const [biometriaError, setBiometriaError]           = useState('');

  const MAX_LENGTH = 6;
  const webauthnSoportado = typeof window !== 'undefined' && !!window.PublicKeyCredential;

  // ── VERIFICAR SESIÓN ACTIVA AL RECARGAR ──
  useEffect(() => {
    // Primero hacemos ping al /health para despertar el backend de Render (cold start)
    // Luego verificamos la sesión con reintentos para tolerar el tiempo de arranque
    const checkSession = async () => {
      // Intentar despertar el backend (sin bloquear)
      fetch('/health').catch(() => {});
      
      // Intentar verificar sesión hasta 3 veces (en caso de cold start de Render)
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        try {
          const r = await fetch('/me', { credentials: 'include' });
          if (r.ok) { setIsAuthenticated(true); break; }
          if (r.status === 401) break; // Sesión inválida, no reintentar
          // Otro error (503, timeout), esperar y reintentar
          if (attempts < maxAttempts - 1) await new Promise(res => setTimeout(res, 3000));
        } catch {
          if (attempts < maxAttempts - 1) await new Promise(res => setTimeout(res, 3000));
        }
        attempts++;
      }
      setCheckingSession(false);
    };
    checkSession();
  }, []);


  useEffect(() => {
    fetch('/bcv-rate').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.valor) {
        const n = parseFloat(data.valor);
        if (!isNaN(n)) { setBcvRateNum(n); setBcvDisplay(n.toFixed(2).replace('.', ',')); }
      }
    }).catch(() => {});
  }, []);

  // ── helpers base64url ──
  const toB64 = (buf: ArrayBuffer): string => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  const fromB64 = (b64: string): ArrayBuffer => {
    const s = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      b64.length + (4 - b64.length % 4) % 4, '='
    );
    const bin = atob(s);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  };

  // ── Registro de biometría ──
  const registrarBiometria = async () => {
    setBiometriaCargando(true); setBiometriaError('');
    try {
      const optsRes = await fetch('/webauthn/register/begin', { method: 'POST', credentials: 'include' });
      if (!optsRes.ok) throw new Error('Error al iniciar registro');
      const opts = await optsRes.json();

      const cred = await navigator.credentials.create({
        publicKey: {
          ...opts,
          challenge: fromB64(opts.challenge),
          user: { ...opts.user, id: fromB64(opts.user.id) },
          excludeCredentials: (opts.excludeCredentials ?? []).map((c: any) => ({ ...c, id: fromB64(c.id) })),
        },
      }) as PublicKeyCredential;
      const resp = cred.response as AuthenticatorAttestationResponse;

      const verRes = await fetch('/webauthn/register/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          id: cred.id, rawId: toB64(cred.rawId), type: cred.type,
          response: {
            clientDataJSON:    toB64(resp.clientDataJSON),
            attestationObject: toB64(resp.attestationObject),
          },
        }),
      });
      if (!verRes.ok) throw new Error('Error al verificar registro');

      localStorage.setItem('biometria_habilitada', '1');
      setBiometriaHabilitada(true);
      setShowBiometricPrompt(false);
    } catch (e: any) {
      if (e.name === 'NotAllowedError') setBiometriaError('Permiso denegado o cancelado');
      else setBiometriaError(e.message || 'No se pudo activar');
    } finally {
      setBiometriaCargando(false);
    }
  };

  // ── Login con biometría ──
  const loginBiometria = async () => {
    setBiometriaCargando(true); setBiometriaError('');
    try {
      const optsRes = await fetch('/webauthn/auth/begin', { method: 'POST' });
      if (!optsRes.ok) {
        // Credencial eliminada en servidor — limpiar localStorage
        localStorage.removeItem('biometria_habilitada');
        setBiometriaHabilitada(false);
        throw new Error('Sin biometría registrada en el servidor');
      }
      const opts = await optsRes.json();

      const cred = await navigator.credentials.get({
        publicKey: {
          ...opts,
          challenge: fromB64(opts.challenge),
          allowCredentials: (opts.allowCredentials ?? []).map((c: any) => ({ ...c, id: fromB64(c.id) })),
        },
      }) as PublicKeyCredential;
      const resp = cred.response as AuthenticatorAssertionResponse;

      const verRes = await fetch('/webauthn/auth/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          id: cred.id, rawId: toB64(cred.rawId), type: cred.type,
          response: {
            clientDataJSON:    toB64(resp.clientDataJSON),
            authenticatorData: toB64(resp.authenticatorData),
            signature:         toB64(resp.signature),
            userHandle:        resp.userHandle ? toB64(resp.userHandle) : null,
          },
        }),
      });
      if (!verRes.ok) throw new Error('Verificación fallida');
      setIsAuthenticated(true);
    } catch (e: any) {
      if (e.name !== 'NotAllowedError') {
        setBiometriaError(e.message || 'Error de autenticación');
        setTimeout(() => setBiometriaError(''), 3000);
      }
    } finally {
      setBiometriaCargando(false);
    }
  };

  const desactivarBiometria = async () => {
    await fetch('/webauthn', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    localStorage.removeItem('biometria_habilitada');
    setBiometriaHabilitada(false);
  };

  const handleKeyPress = useCallback((num: string) => {
    if (passcode.length < MAX_LENGTH && !isError) {
      window.navigator?.vibrate?.(50);
      const next = passcode + num;
      setPasscode(next);
      if (next.length === MAX_LENGTH) validatePasscode(next);
    }
  }, [passcode, isError]);

  const triggerError = () => {
    setIsError(true); window.navigator?.vibrate?.([100, 50, 100, 50, 100]);
    setTimeout(() => { setPasscode(''); setIsError(false); }, 500);
  };

  const validatePasscode = async (code: string) => {
    try {
      const r = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin: code })
      });
      if (r.ok) {
        setIsAuthenticated(true); setPasscode('');
        // Ofrecer biometría si está disponible y no está registrada aún
        if (webauthnSoportado && !biometriaHabilitada) setShowBiometricPrompt(true);
      } else triggerError();
    } catch { triggerError(); }
  };

  const keyPadData = [
    { num: '1', letters: '' },      { num: '2', letters: 'A B C' }, { num: '3', letters: 'D E F' },
    { num: '4', letters: 'G H I' }, { num: '5', letters: 'J K L' }, { num: '6', letters: 'M N O' },
    { num: '7', letters: 'P Q R S' },{ num: '8', letters: 'T U V' },{ num: '9', letters: 'W X Y Z' },
  ];

  // ── PANEL (scroll natural del navegador) ──
  if (checkingSession) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#0b57d0]/20 border-t-[#0b57d0] rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <p className="text-[#1f1f1f] text-xs tracking-widest uppercase font-semibold">Conectando...</p>
            <p className="text-[#5f6368] text-[10px] font-medium">Iniciando servidor, un momento...</p>
          </div>
        </div>
      </div>
    );
  }


  if (isAuthenticated) {
    return (
      <div className="min-h-[100dvh] font-sans select-none gemini-royal-theme relative">
        <div className="bg-watermark" />
        <BcvBadge display={bcvDisplay} />
        <AdminPanel
          onLogout={() => setIsAuthenticated(false)}
          bcvRate={bcvRateNum}
          biometriaHabilitada={biometriaHabilitada}
          onDesactivarBiometria={desactivarBiometria}
        />
        {/* Modal de activación de biometría */}
        {showBiometricPrompt && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white/20 backdrop-blur-xl border border-white/30 rounded-t-3xl w-full max-w-sm px-6 pt-6 pb-10">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mb-1">
                  <Fingerprint size={30} className="text-white" />
                </div>
                <h2 className="text-white text-[16px] font-light">Acceso rápido</h2>
                <p className="text-white/60 text-[12px] leading-relaxed">
                  ¿Quieres iniciar sesión la próxima vez<br />con huella o Face ID?
                </p>
                {biometriaError && (
                  <p className="text-red-300 text-[11px] bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2 w-full">{biometriaError}</p>
                )}
                <div className="flex gap-3 w-full mt-1">
                  <button onClick={() => setShowBiometricPrompt(false)} disabled={biometriaCargando}
                    className="flex-1 py-3 rounded-xl border border-white/25 text-white/60 text-[12px] hover:bg-white/10 transition-all">
                    Ahora no
                  </button>
                  <button onClick={registrarBiometria} disabled={biometriaCargando}
                    className="flex-1 py-3 rounded-xl bg-white text-gray-800 font-medium text-[12px] disabled:opacity-50 hover:bg-white/90 active:scale-[0.98] transition-all">
                    {biometriaCargando ? 'Activando…' : 'Activar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── LOGIN (centrado en pantalla) ──
  return (
    <div className="h-[100dvh] font-sans select-none touch-manipulation flex flex-col items-center justify-start pt-[5dvh]">
      <div className="bg-watermark" />
      <BcvBadge display={bcvDisplay} />
      <div className="relative z-10 flex flex-col items-center w-full px-4">
        
        {/* Logotipo corporativo blanco horizontal sin contenedor */}
        <div className="mb-6 flex flex-col items-center animate-fade-in w-full max-w-[280px]">
          <img src="/logo-horizontal-white.png" alt="La Casa Del Encaje" className="h-[52px] object-contain" />
        </div>

        <h1 className="text-[13px] font-semibold text-white/70 mb-5 tracking-[0.2em] uppercase Outfit-font-heading">Ingresa tu contraseña</h1>

        <div className={`flex items-center justify-center gap-[18px] mb-[40px] ${isError ? 'animate-shake' : ''}`}>
          {Array.from({ length: MAX_LENGTH }).map((_, i) => (
            <div key={i} className={`w-[11px] h-[11px] rounded-full transition-colors duration-150 ease-out ${
              i < passcode.length ? 'bg-white border-[1.5px] border-white animate-pop' : 'bg-transparent border-[1.5px] border-white/35'
            }`} />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-x-[24px] gap-y-[16px]">
          {keyPadData.map(item => (
            <KeypadButton key={item.num} num={item.num} letters={item.letters} onClick={() => handleKeyPress(item.num)} />
          ))}
          <div className="col-start-2">
            <KeypadButton num="0" letters="" onClick={() => handleKeyPress('0')} />
          </div>
          <div className="col-start-3 flex items-center justify-center">
            <button onClick={() => setPasscode(p => p.slice(0, -1))}
              className="w-[75px] h-[75px] rounded-full flex items-center justify-center text-white/60 hover:text-white active:scale-[0.92] transition-all duration-150 focus:outline-none"
              aria-label="Borrar">
              <Delete size={20} />
            </button>
          </div>
        </div>

        {/* Botón de biometría */}
        {biometriaHabilitada && webauthnSoportado && (
          <div className="flex flex-col items-center mt-10 gap-2">
            <button onClick={loginBiometria} disabled={biometriaCargando}
              className="flex flex-col items-center gap-1 text-white/70 hover:text-white disabled:opacity-40 transition-colors active:scale-95">
              <Fingerprint size={40} strokeWidth={1.2} />
              <span className="text-[11.5px] font-semibold tracking-wide">{biometriaCargando ? 'Verificando…' : 'Usar biometría'}</span>
            </button>
            {biometriaError && (
              <p className="text-red-300 text-[10.5px] mt-1.5 bg-red-500/20 border border-red-400/25 rounded-full px-4 py-1 text-center">{biometriaError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const KeypadButton = ({ num, letters, onClick }: { num: string; letters: string; onClick: () => void }) => (
  <button onClick={onClick}
    className="ios-keypad-btn focus:outline-none select-none touch-manipulation"
    aria-label={`Digit ${num}`}>
    <span className={`text-[32px] font-light text-[#1f1f1f] leading-none tracking-tight ${letters ? 'mt-[-1px]' : 'mt-[1px]'}`}>
      {num}
    </span>
    {letters && <span className="text-[9px] font-bold text-[#5f6368] uppercase tracking-[0.2em] mt-[3px] ml-[1px]">{letters}</span>}
  </button>
);

