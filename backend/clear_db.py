import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(url, key)

try:
    # Obtener todos los IDs
    response = supabase.table('colaboradores').select('id').execute()
    for row in response.data:
        supabase.table('colaboradores').delete().eq('id', row['id']).execute()
    print("Colaboradores (y pagos en cascada) eliminados correctamente.")
except Exception as e:
    print(f"Error: {e}")
