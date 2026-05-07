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
    sueldo NUMERIC NOT NULL
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

ALTER TABLE colaboradores DISABLE ROW LEVEL SECURITY;
ALTER TABLE pagos DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;
