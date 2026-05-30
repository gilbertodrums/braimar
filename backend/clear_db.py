import os
import shutil
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar variables de entorno del backend
backend_dir = Path(__file__).parent.resolve()
env_path = backend_dir / ".env"
load_dotenv(dotenv_path=env_path)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL o SUPABASE_SERVICE_KEY no encontrados en las variables de entorno.")
    exit(1)

supabase: Client = create_client(url, key)

print("Iniciando restablecimiento de base de datos y almacenamiento de Braimar a cero...")

# 1. Eliminar colaboradores (se borran por CASCADE pagos y horas extras en la base de datos)
try:
    print("Eliminando colaboradores en Supabase (con cascada para pagos y horas extras)...")
    response = supabase.table('colaboradores').select('id').execute()
    if response.data:
        for row in response.data:
            supabase.table('colaboradores').delete().eq('id', row['id']).execute()
        print(f"[OK] {len(response.data)} colaboradores eliminados correctamente de la base de datos.")
    else:
        print("[OK] No se encontraron colaboradores en la base de datos.")
except Exception as e:
    # Print clean representation
    print(f"[ERROR] Error eliminando colaboradores: {repr(e)}")

# 2. Limpiar PDFs almacenados en Supabase Storage
try:
    print("Limpiando archivos PDF en el bucket 'pagos' de Supabase Storage...")
    files = supabase.storage.from_("pagos").list()
    if files:
        file_names = [f["name"] for f in files if f["name"] != ".emptyFolderPlaceholder"]
        if file_names:
            supabase.storage.from_("pagos").remove(file_names)
            print(f"[OK] {len(file_names)} archivos PDF eliminados de Supabase Storage.")
        else:
            print("[OK] No habia archivos para eliminar en el bucket.")
    else:
        print("[OK] El bucket 'pagos' esta vacio.")
except Exception as e:
    print(f"[ERROR] Error limpiando Supabase Storage: {repr(e)}")

# 3. Restablecer archivos JSON locales de respaldo a [] (vacio)
local_files = ["colaboradores.json", "pagos_index.json"]
for filename in local_files:
    file_path = backend_dir / filename
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write("[]")
        print(f"[OK] Archivo local '{filename}' restablecido a [].")
    except Exception as e:
        print(f"[ERROR] Error restableciendo archivo '{filename}': {repr(e)}")

# 4. Limpiar la carpeta de pagos locales si existe
pagos_dir = backend_dir / "pagos"
if pagos_dir.exists() and pagos_dir.is_dir():
    try:
        shutil.rmtree(pagos_dir)
        pagos_dir.mkdir(exist_ok=True)
        print("[OK] Carpeta local 'backend/pagos/' vaciada.")
    except Exception as e:
        print(f"[ERROR] Error vaciando carpeta 'backend/pagos/': {repr(e)}")

print("\nTodo listo! El sistema Braimar ha sido restablecido a cero exitosamente.")
