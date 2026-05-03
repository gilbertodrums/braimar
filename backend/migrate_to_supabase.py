import os
import json
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import asyncio

load_dotenv()

url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

base_dir = Path(__file__).parent
COLABORADORES_FILE = base_dir / "colaboradores.json"
PAGOS_INDEX_FILE = base_dir / "pagos_index.json"
PAGOS_DIR = base_dir / "pagos"

def migrate():
    print("Iniciando migración a Supabase...")

    # 1. Migrar Colaboradores
    if COLABORADORES_FILE.exists():
        with open(COLABORADORES_FILE, 'r', encoding='utf-8') as f:
            colaboradores = json.load(f)
            if colaboradores:
                print(f"Migrando {len(colaboradores)} colaboradores...")
                for c in colaboradores:
                    # Preparar el objeto para supabase
                    try:
                        supabase.table("colaboradores").insert(c).execute()
                        print(f"  + Colaborador migrado: {c['nombre']} {c['apellido']}")
                    except Exception as e:
                        print(f"  ! Error migrando {c['nombre']}: {e}")
            else:
                print("No hay colaboradores para migrar.")

    # 2. Migrar Pagos y Archivos PDF
    if PAGOS_INDEX_FILE.exists():
        with open(PAGOS_INDEX_FILE, 'r', encoding='utf-8') as f:
            pagos = json.load(f)
            if pagos:
                print(f"\nMigrando {len(pagos)} registros de pagos...")
                for p in pagos:
                    try:
                        # Insertar en base de datos
                        supabase.table("pagos").insert(p).execute()
                        print(f"  + Pago migrado ID: {p['id']}")
                        
                        # Subir PDF si existe
                        pdf_file = PAGOS_DIR / f"{p['id']}.pdf"
                        if pdf_file.exists():
                            with open(pdf_file, 'rb') as pdf:
                                file_path = f"{p['id']}.pdf"
                                supabase.storage.from_("pagos").upload(file_path, pdf.read(), file_options={"content-type": "application/pdf"})
                            print(f"    * PDF subido: {file_path}")
                    except Exception as e:
                        print(f"  ! Error migrando pago {p['id']}: {e}")
            else:
                print("No hay pagos para migrar.")

    print("\n¡Migración finalizada!")

if __name__ == "__main__":
    migrate()
