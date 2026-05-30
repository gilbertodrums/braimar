-- Crear tabla de Colaboradores
CREATE TABLE colaboradores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    cedula TEXT NOT NULL,
    telefono TEXT NOT NULL,
    correo TEXT,
    fecha_ingreso DATE NOT NULL,
    tipo_turno TEXT NOT NULL,
    sueldo NUMERIC NOT NULL,
    bono_alimentacion NUMERIC DEFAULT 40.0,
    bonos NUMERIC DEFAULT 120.0
);

-- Crear tabla de Pagos
CREATE TABLE pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    desde DATE NOT NULL,
    hasta DATE NOT NULL,
    total NUMERIC NOT NULL,
    fecha_generado DATE NOT NULL,
    hora_generado TIME NOT NULL
);

-- Tabla de configuracion persistente (PIN, WebAuthn)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Habilitar RLS (Row Level Security) opcional, por ahora lo dejamos publico para la conexion de prueba o lo deshabilitamos.
-- Para que el backend pueda leer y escribir libremente usando la "Service Role Key" no hace falta, 
-- pero como usaremos la 'anon key' y queremos que no falle, desactivaremos RLS momentaneamente:
ALTER TABLE colaboradores DISABLE ROW LEVEL SECURITY;
ALTER TABLE pagos DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Crear tabla de Horas Extras
CREATE TABLE horas_extras (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    colaborador_id UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    horas NUMERIC NOT NULL,
    hora_inicio TEXT,
    hora_fin TEXT,
    fecha_generado DATE,
    hora_generado TIME
);

-- Deshabilitar RLS para la tabla de horas extras
ALTER TABLE horas_extras DISABLE ROW LEVEL SECURITY;
