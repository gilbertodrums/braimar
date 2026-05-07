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
  sueldo: number;
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
  | 'finanzas';

// ─── FORMULARIO COLABORADOR ───────────────────────────────────────────────────
function ColaboradorForm({ inicial, onGuardar, onCancelar, bcvRate }: {
  inicial?: Colaborador;
  onGuardar: (data: Omit<Colaborador, 'id'>) => Promise<void>;
  onCancelar: () => void;
  bcvRate: number | null;
}) {
  const [form, setForm] = useState({
    nombre:        inicial?.nombre        ?? '',
    apellido:      inicial?.apellido      ?? '',
    cedula:        inicial?.cedula        ?? '',
    telefono:      inicial?.telefono      ?? '',
    correo:        inicial?.correo        ?? '',
    fecha_ingreso: inicial?.fecha_ingreso ?? '',
    tipo_turno:    inicial?.tipo_turno    ?? 'completo' as 'completo' | 'medio',
    sueldo:        String(inicial?.sueldo ?? ''),
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState('');

  const apellidoRef = useRef<HTMLInputElement>(null);
  const cedulaRef   = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const correoRef   = useRef<HTMLInputElement>(null);
  const sueldoRef   = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!form.nombre.trim() || !form.apellido.trim()) { setError('Nombre y apellido son obligatorios'); return; }
    if (!form.cedula.trim())  { setError('La cédula es obligatoria'); return; }
    if (!form.fecha_ingreso)  { setError('La fecha de ingreso es obligatoria'); return; }
    setGuardando(true);
    try   { await onGuardar({ ...form, sueldo: parseFloat(form.sueldo) || 0 }); }
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
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150 [color-scheme:dark]"
        />
      </div>

      {/* Sueldo */}
      <div className="flex flex-col gap-1">
        <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
          <Banknote size={10} /> Sueldo (USD)
        </label>
        <div className="relative">
          <input
            ref={sueldoRef}
            type="text" inputMode="decimal" value={form.sueldo}
            onChange={e => set('sueldo', e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sueldoRef.current?.blur(); } }}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] placeholder-white/30 focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all duration-150"
          />
        </div>
        {/* Conversión en tiempo real */}
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

      {/* Tipo de turno */}
      <div className="flex flex-col gap-1">
        <label className="text-white/50 text-[10px] px-0.5 flex items-center gap-1">
          <Clock size={10} /> Tipo de turno
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['completo', 'medio'] as const).map(t => (
            <button key={t} type="button" onClick={() => set('tipo_turno', t)}
              className={`py-2.5 rounded-lg text-[11px] font-medium border transition-all duration-150 ${
                form.tipo_turno === t
                  ? 'bg-white text-gray-800 border-white shadow-sm'
                  : 'bg-white/10 text-white/70 border-white/20 hover:bg-white/15'
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
          className="flex-1 py-2.5 rounded-xl text-[11px] font-medium border border-white/20 text-white/70 bg-white/10 hover:bg-white/15 transition-all">
          Cancelar
        </button>
        <button type="submit" disabled={guardando}
          className="flex-1 py-2.5 rounded-xl text-[11px] font-medium bg-white text-gray-800 disabled:opacity-40 hover:bg-white/90 active:scale-[0.98] transition-all">
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
  inputRef?: React.RefObject<HTMLInputElement>;
  onEnter?: () => void;
  isLast?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-white/50 text-[10px] px-0.5">{label}</label>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>}
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

  const formatFecha = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

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

      <div className="flex flex-col gap-2 pb-16">
        {cargando && <p className="text-white/50 text-[11px] text-center mt-8">Cargando...</p>}
        {!cargando && colaboradores.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-10 gap-2 text-center">
            <Users size={28} className="text-white/20" />
            <p className="text-white/40 text-[11px]">No hay colaboradores aún.<br />Presiona Añadir para comenzar.</p>
          </div>
        )}
        {colaboradores.map(c => (
          <div key={c.id} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-white font-medium text-[12px] truncate">{c.nombre} {c.apellido}</span>
                  <span className={`shrink-0 text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                    c.tipo_turno === 'completo'
                      ? 'bg-blue-400/20 text-blue-200 border border-blue-400/30'
                      : 'bg-amber-400/20 text-amber-200 border border-amber-400/30'
                  }`}>
                    {c.tipo_turno === 'completo' ? 'Completo' : 'Medio'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="text-white/40 text-[10px] flex items-center gap-0.5"><IdCard size={9} />{c.cedula}</span>
                  {c.telefono && <span className="text-white/40 text-[10px] flex items-center gap-0.5"><Phone size={9} />{c.telefono}</span>}
                  {c.correo && <span className="text-white/40 text-[10px] flex items-center gap-0.5 break-all"><Mail size={9} />{c.correo}</span>}
                  {c.fecha_ingreso && <span className="text-white/40 text-[10px] flex items-center gap-0.5"><Calendar size={9} />{formatFecha(c.fecha_ingreso)}</span>}
                </div>
                {c.sueldo > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-white/50 text-[10px] flex items-center gap-0.5 font-medium">
                      <Banknote size={9} />
                      $ {c.sueldo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                    {bcvRateForCard && (
                      <>
                        <span className="text-white/20 text-[9px]">·</span>
                        <span className="text-white/60 text-[10px]">
                          ≈ Bs. {(c.sueldo * bcvRateForCard).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => onEditar(c)} className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all">
                  <Pencil size={11} />
                </button>
                <button onClick={() => setConfirmDelete(c.id)} className="w-7 h-7 flex items-center justify-center rounded-full text-white/40 hover:text-red-300 hover:bg-red-400/15 transition-all">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            {confirmDelete === c.id && (
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                <span className="text-white/50 text-[10px]">¿Eliminar a {c.nombre}?</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setConfirmDelete(null)} className="text-[9px] px-2.5 py-1 rounded-md border border-white/20 text-white/60 hover:bg-white/10 transition-all">Cancelar</button>
                  <button onClick={() => { onEliminar(c.id); setConfirmDelete(null); }} className="text-[9px] px-2.5 py-1 rounded-md bg-red-500/80 text-white hover:bg-red-500 transition-all">Eliminar</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
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

  useEffect(() => {
    fetch((import.meta.env.VITE_API_URL || '') + '/colaboradores', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setColaboradores)
      .catch(() => {});
  }, []);

  const colaborador = colaboradores.find(c => c.id === selectedId) ?? null;
  const sueldoQuincenalUSD = colaborador ? (colaborador.sueldo ?? 0) / 2 : 0;
  const sueldoQuincenalBs = sueldoQuincenalUSD * (bcvRate ?? 0);
  const bonoNum         = parseFloat(bono) || 0;
  const totalPagar      = sueldoQuincenalBs + bonoNum;

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
      const doc    = new jsPDF({ unit: 'mm', format: 'a4' });
      const W      = doc.internal.pageSize.getWidth();   // 210
      const margin = 18;
      const col1   = margin;
      const col2   = 110;

      // ── CABECERA AZUL ──────────────────────────────────────────────────
      doc.setFillColor(0, 97, 255);
      doc.roundedRect(0, 0, W, 44, 0, 0, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('RECIBO DE PAGO', W / 2, 13, { align: 'center' });

      doc.setFontSize(11);
      doc.text('LA CASA DEL ENCAJE', W / 2, 21, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text('RIF: V-08053912-2', W / 2, 29, { align: 'center' });
      doc.text('Carrera 9 entre calles 20 y 21. Guanare, Edo Portuguesa.', W / 2, 35.5, { align: 'center' });

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

      // Tabla de conceptos
      const addConcepto = (concepto: string, monto: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(9);
        doc.setTextColor(bold ? 10 : 50, bold ? 10 : 50, bold ? 10 : 60);
        doc.text(concepto, col1, y);
        doc.setTextColor(bold ? 0 : 40, bold ? 80 : 40, bold ? 0 : 40);
        doc.text(monto, W - margin, y, { align: 'right' });
        y += 8;
      };

      addConcepto(`Sueldo Quincenal ($${sueldoQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)`, formatBs(sueldoQuincenalBs));
      addConcepto('Bono de asistencia y puntualidad', formatBs(bonoNum));

      // Línea total
      y += 1;
      doc.setDrawColor(0, 97, 255);
      doc.setLineWidth(0.5);
      doc.line(margin, y, W - margin, y);
      y += 6;
      addConcepto('TOTAL A PAGAR', formatBs(totalPagar), true);

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

      // ── GUARDAR ────────────────────────────────────────────────────────
      const nombreArchivo = `recibo_${colSnap.nombre.toLowerCase()}_${colSnap.apellido.toLowerCase()}_${desdeSnap}_${hastaSnap}.pdf`.replace(/\s+/g, '_');
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      doc.save(nombreArchivo);

      // ── RESET CAMPOS ───────────────────────────────────────────────────
      setSelectedId('');
      setDesde(defaultDesde);
      setHasta(defaultHasta);
      setBono('');

      // ── GUARDAR PAGO EN SERVIDOR ────────────────────────────────────────
      fetch((import.meta.env.VITE_API_URL || '') + '/pagos', {
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
      }).catch(() => {});

      // ── ENVIAR CORREO ──────────────────────────────────────────────────
      if (colSnap.correo) {
        setEnviando(true);
        try {
          const r = await fetch((import.meta.env.VITE_API_URL || '') + '/enviar-recibo', {
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
    } catch (e) {
      setError('Error al generar el PDF. Intenta de nuevo.');
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
              <Banknote size={9} />Sueldo mensual: $ {colaborador.sueldo?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'} USD
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
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-white text-[11px] focus:outline-none focus:border-white/50 focus:bg-white/15 transition-all [color-scheme:dark]" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-white/30 text-[9px] px-0.5">Hasta</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                min={desde}
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
              <span className="text-white/50">Sueldo quincenal ($ {sueldoQuincenalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)</span>
              <span className="text-white/80">{formatBs(sueldoQuincenalBs)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-white/50">Bono asistencia y puntualidad</span>
              <span className="text-white/80">{formatBs(bonoNum)}</span>
            </div>
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

  useEffect(() => {
    fetch((import.meta.env.VITE_API_URL || '') + '/colaboradores', { credentials: 'include' })
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
              <button
                onClick={() => verPDF(p)}
                disabled={abriendo === p.id}
                className="shrink-0 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-[10px] font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 active:scale-95">
                <FileDown size={11} />
                {abriendo === p.id ? '…' : 'Ver PDF'}
              </button>
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
    fetch((import.meta.env.VITE_API_URL || '') + '/finanzas', { credentials: 'include', cache: 'no-store' })
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
    try { const r = await fetch((import.meta.env.VITE_API_URL || '') + '/colaboradores', { credentials: 'include' }); if (r.ok) setColaboradores(await r.json()); }
    finally { setCargandoColab(false); }
  };

  const handleGuardarColaborador = async (data: Omit<Colaborador, 'id'>) => {
    if (editando) {
      const r = await fetch(`/colaboradores/${editando.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
      const updated = await r.json();
      setColaboradores(cs => cs.map(c => c.id === editando.id ? updated : c));
    } else {
      const r = await fetch((import.meta.env.VITE_API_URL || '') + '/colaboradores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
      const nuevo = await r.json();
      setColaboradores(cs => [...cs, nuevo]);
    }
    setEditando(undefined);
    setView('mis-colaboradores');
  };

  const handleEliminar = async (id: string) => {
    await fetch(`/colaboradores/${id}`, { method: 'DELETE', credentials: 'include' });
    setColaboradores(cs => cs.filter(c => c.id !== id));
  };

  const abrirFormulario = (c?: Colaborador) => { setEditando(c); setView('colaborador-form'); };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    if (newPin !== confirmPin) { setErrorMsg('Los PINs nuevos no coinciden'); return; }
    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) { setErrorMsg('El nuevo PIN debe tener 6 dígitos'); return; }
    setSubmitState('loading');
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || '') + '/change-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }) });
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
          <div className="pt-10 pb-6">
            <div className="flex justify-end mb-4">
              <button onClick={onLogout} className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-[11px]">
                <LogOut size={12} /> Cerrar sesión
              </button>
            </div>
            <p className="text-white/40 text-[9px] uppercase tracking-widest mb-1">Panel de administrador</p>
            <h1 className="text-xl font-light text-white">Bienvenida Braimar</h1>
          </div>
          <div className="flex flex-col gap-2 pb-16">
            <SectionCard icon={<Shield size={10} className="text-white/40" />} titulo="Seguridad"
              items={[
                { label: 'Cambiar contraseña', onClick: () => setView('change-pin') },
                ...(biometriaHabilitada ? [{
                  label: 'Desactivar biometría',
                  icon: <Fingerprint size={11} className="text-white/40" />,
                  onClick: onDesactivarBiometria,
                }] : []),
              ]} />
            <SectionCard icon={<CreditCard size={10} className="text-white/40" />} titulo="Pago a colaboradores"
              items={[
                { label: 'Mis colaboradores',  icon: <Users size={11} className="text-white/40" />,    onClick: () => { fetchColaboradores(); setView('mis-colaboradores'); } },
                { label: 'Pagos realizados',   icon: <Banknote size={11} className="text-white/40" />, onClick: () => setView('pagos-realizados') },
                { label: 'Generar pago',       icon: <CreditCard size={11} className="text-white/40" />, onClick: () => setView('generar-pago') },
                { label: 'Control de finanzas', icon: <Banknote size={11} className="text-white/40" />,  onClick: () => setView('finanzas') },
              ]}
            />
          </div>
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
    </div>
  );
}

// ─── COMPONENTES AUXILIARES ───────────────────────────────────────────────────
function SectionCard({ icon, titulo, items }: {
  icon: React.ReactNode; titulo: string;
  items: { label: string; icon?: React.ReactNode; onClick: () => void }[];
}) {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl overflow-hidden border border-white/15">
      <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-1.5">
        {icon}
        <p className="text-white/40 text-[9px] uppercase tracking-widest">{titulo}</p>
      </div>
      {items.map((item, i) => (
        <button key={i} onClick={item.onClick}
          className={`w-full flex items-center justify-between px-4 py-3 text-white hover:bg-white/10 active:bg-white/15 transition-colors ${i < items.length - 1 ? 'border-b border-white/10' : ''}`}>
          <span className="flex items-center gap-2 text-[11px]">{item.icon}{item.label}</span>
          <ChevronRight size={12} className="text-white/30" />
        </button>
      ))}
    </div>
  );
}

function Placeholder({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center mt-10 gap-2 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
        <Clock size={18} className="text-white/30" />
      </div>
      <p className="text-white/40 text-[11px]">{texto}</p>
    </div>
  );
}

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
    fetch((import.meta.env.VITE_API_URL || '') + '/me', { credentials: 'include' })
      .then(r => {
        if (r.ok) setIsAuthenticated(true);
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    fetch((import.meta.env.VITE_API_URL || '') + '/bcv-rate').then(r => r.ok ? r.json() : null).then(data => {
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
      const optsRes = await fetch((import.meta.env.VITE_API_URL || '') + '/webauthn/register/begin', { method: 'POST', credentials: 'include' });
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

      const verRes = await fetch((import.meta.env.VITE_API_URL || '') + '/webauthn/register/complete', {
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
      const optsRes = await fetch((import.meta.env.VITE_API_URL || '') + '/webauthn/auth/begin', { method: 'POST' });
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

      const verRes = await fetch((import.meta.env.VITE_API_URL || '') + '/webauthn/auth/complete', {
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
    await fetch((import.meta.env.VITE_API_URL || '') + '/webauthn', { method: 'DELETE', credentials: 'include' }).catch(() => {});
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
      const r = await fetch((import.meta.env.VITE_API_URL || '') + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: code }) });
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
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#1a0533]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          <p className="text-white/40 text-xs tracking-widest uppercase">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-[100dvh] font-sans select-none">
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
    <div className="h-[100dvh] font-sans select-none touch-manipulation flex flex-col items-center justify-center">
      <BcvBadge display={bcvDisplay} />
      <div className="relative z-10 flex flex-col items-center w-full px-4">
        <h1 className="text-[15px] font-normal text-white/80 mb-6 tracking-wide">Ingresa tu contraseña</h1>

        <div className={`flex items-center justify-center gap-[15px] mb-[42px] ${isError ? 'animate-shake' : ''}`}>
          {Array.from({ length: MAX_LENGTH }).map((_, i) => (
            <div key={i} className={`w-[9px] h-[9px] rounded-full transition-colors duration-150 ease-out ${
              i < passcode.length ? 'bg-white border-[1.5px] border-white animate-pop' : 'bg-transparent border-[1.5px] border-white/50'
            }`} />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-x-[18px] gap-y-[13px]">
          {keyPadData.map(item => (
            <KeypadButton key={item.num} num={item.num} letters={item.letters} onClick={() => handleKeyPress(item.num)} />
          ))}
          <div className="col-start-2">
            <KeypadButton num="0" letters="" onClick={() => handleKeyPress('0')} />
          </div>
          <div className="col-start-3 flex items-center justify-center">
            <button onClick={() => setPasscode(p => p.slice(0, -1))}
              className="w-[54px] h-[54px] rounded-full flex items-center justify-center text-white/50 hover:text-white active:scale-[0.92] transition-all duration-150 focus:outline-none"
              aria-label="Borrar">
              <Delete size={18} />
            </button>
          </div>
        </div>

        {/* Botón de biometría */}
        {biometriaHabilitada && webauthnSoportado && (
          <div className="flex flex-col items-center mt-10 gap-2">
            <button onClick={loginBiometria} disabled={biometriaCargando}
              className="flex flex-col items-center gap-1.5 text-white/50 hover:text-white disabled:opacity-40 transition-colors active:scale-95">
              <Fingerprint size={36} strokeWidth={1.2} />
              <span className="text-[11px]">{biometriaCargando ? 'Verificando…' : 'Usar biometría'}</span>
            </button>
            {biometriaError && (
              <p className="text-red-300 text-[10px] mt-1">{biometriaError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const KeypadButton = ({ num, letters, onClick }: { num: string; letters: string; onClick: () => void }) => (
  <button onClick={onClick}
    className="relative flex flex-col items-center justify-center w-[54px] h-[54px] rounded-full bg-white/15 backdrop-blur-md border border-white/20 transition-all duration-500 ease-out active:duration-75 active:scale-[0.92] active:bg-white/30 focus:outline-none"
    aria-label={`Digit ${num}`}>
    <span className={`text-[27px] font-light text-white leading-none tracking-tight ${letters ? 'mt-[-3px]' : 'mt-[1px]'}`}>
      {num}
    </span>
    {letters && <span className="text-[7px] font-bold text-white/60 uppercase tracking-[0.2em] mt-[2px] ml-[1px]">{letters}</span>}
  </button>
);

