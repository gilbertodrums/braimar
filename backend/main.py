from fastapi import FastAPI, HTTPException, Request, Response, status, Query, Header
from urllib.parse import urlparse
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse
import logging
logging.basicConfig(level=logging.INFO)
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
from typing import Optional
from fastapi import Cookie
import bcrypt
import jwt
import datetime
import json
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import httpx
import time
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    ResidentKeyRequirement,
    PublicKeyCredentialDescriptor,
    RegistrationCredential,
    AuthenticatorAttestationResponse,
    AuthenticationCredential,
    AuthenticatorAssertionResponse,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from lxml import html
import uuid
import smtplib
import base64
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders as email_encoders

load_dotenv()

# --- CONFIGURACION DE SEGURIDAD ---
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY no definida en .env")

ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
ALGORITHM = "HS256"

# Supabase Initialization
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Configuración de Supabase no encontrada en .env")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BCV_CACHE_FILE = Path(__file__).parent / "bcv_cache.json"
HORAS_EXTRAS_FILE = Path(__file__).parent / "horas_extras.json"
COLABORADORES_FILE = Path(__file__).parent / "colaboradores.json"

DEFAULT_PIN = "052026"
PEPPER_KEY = os.getenv("PEPPER_KEY", "braimar_default_pepper_secure_string_98765")

# Global in-memory cache for active session ID
_active_session_id = None

def get_active_session_id() -> Optional[str]:
    global _active_session_id
    if _active_session_id:
        return _active_session_id
    
    # Try Supabase
    try:
        resp = supabase.table("settings").select("value").eq("key", "active_session_id").execute()
        if resp.data:
            _active_session_id = resp.data[0]["value"]
            return _active_session_id
    except Exception as e:
        logging.error(f"Error reading active_session_id from Supabase: {e}")
        
    # Try local file fallback
    try:
        path = Path(__file__).parent / "session.json"
        if path.exists():
            _active_session_id = path.read_text(encoding="utf-8").strip()
            return _active_session_id
    except Exception as e:
        logging.error(f"Error reading local session.json: {e}")
        
    return None

def set_active_session_id(session_id: str):
    global _active_session_id
    _active_session_id = session_id
    
    # Try Supabase
    try:
        supabase.table("settings").upsert({"key": "active_session_id", "value": session_id}).execute()
    except Exception as e:
        logging.error(f"Error saving active_session_id to Supabase: {e}")
        
    # Try local file fallback
    try:
        path = Path(__file__).parent / "session.json"
        path.write_text(session_id, encoding="utf-8")
    except Exception as e:
        logging.error(f"Error saving local session.json: {e}")

# Challenge temporal en memoria (sistema monousuario)
_wn_challenge: dict = {}  # {"value": bytes, "expires": float}

def get_client_rp(request: Request):
    # 1. Intentar de X-Forwarded-Host (en Vercel siempre es la web de cara al usuario)
    x_host = request.headers.get("x-forwarded-host")
    x_proto = request.headers.get("x-forwarded-proto", "https")
    if x_host:
        rp_id = x_host.split(":")[0]
        rp_origin = f"{x_proto}://{x_host}"
        return rp_id, rp_origin

    # 2. Intentar de Origin
    origin = request.headers.get("origin")
    if origin:
        parsed = urlparse(origin)
        rp_id = parsed.hostname or "localhost"
        return rp_id, origin

    # 3. Intentar de Referer
    referer = request.headers.get("referer")
    if referer:
        parsed = urlparse(referer)
        rp_id = parsed.hostname or "localhost"
        rp_origin = f"{parsed.scheme}://{parsed.netloc}"
        return rp_id, rp_origin

    # 4. Fallback a env o defaults
    rp_id = os.getenv("RP_ID", "localhost")
    rp_origin = os.getenv("RP_ORIGIN", "http://localhost:5173")
    return rp_id, rp_origin

# Venezuela: UTC-4 (sin horario de verano)
VET = datetime.timezone(datetime.timedelta(hours=-4))


def _vet_now() -> datetime.datetime:
    return datetime.datetime.now(VET)


def _load_bcv_cache() -> Optional[dict]:
    if BCV_CACHE_FILE.exists():
        try:
            return json.loads(BCV_CACHE_FILE.read_text())
        except Exception:
            return None
    return None


def _save_bcv_cache(valor: str, fecha_valor: str) -> dict:
    now = _vet_now()
    data = {
        "valor": valor,
        "fecha_valor": fecha_valor,
        "fecha_cache": now.strftime("%Y-%m-%d"),
        "hora_cache": now.strftime("%H:%M"),
    }
    BCV_CACHE_FILE.write_text(json.dumps(data))
    return data


def _is_cache_valid(cache: dict) -> bool:
    now = _vet_now()
    today = now.strftime("%Y-%m-%d")
    if cache.get("fecha_cache") != today:
        return False
    hora = cache.get("hora_cache", "00:00")
    h, m = map(int, hora.split(":"))
    # Válido solo si fue obtenido a partir de las 10:00 AM VET
    return (h * 60 + m) >= 600


async def _scrape_bcv_usd() -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; BCVScraper/1.0)",
        "Accept-Language": "es-VE,es;q=0.9",
    }
    async with httpx.AsyncClient(verify=False, follow_redirects=True, timeout=15) as client:
        resp = await client.get("https://www.bcv.org.ve/", headers=headers)
    resp.raise_for_status()
    tree = html.fromstring(resp.content)
    value_nodes = tree.xpath(
        "//div[@id='dolar']//div[contains(@class,'centrado')]//strong/text()"
    )
    date_nodes = tree.xpath(
        "//span[contains(@class,'date-display-single')]/text()"
    )
    if not value_nodes:
        raise ValueError("Selector BCV no encontró el valor USD")
    valor = value_nodes[0].strip().replace(",", ".")
    fecha = date_nodes[0].strip() if date_nodes else ""
    return {"valor": valor, "fecha_valor": fecha}

def get_pin_hash() -> bytes:
    try:
        resp = supabase.table("settings").select("value").eq("key", "pin_hash").execute()
        if resp.data:
            return resp.data[0]["value"].encode("utf-8")
    except Exception as e:
        logging.error(f"Error reading pin_hash from Supabase: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de base de datos no disponible temporalmente"
        )
    default_hash = bcrypt.hashpw(f"{DEFAULT_PIN}{PEPPER_KEY}".encode('utf-8'), bcrypt.gensalt(12))
    set_pin_hash(default_hash)
    return default_hash

def set_pin_hash(new_hash: bytes):
    try:
        supabase.table("settings").upsert({"key": "pin_hash", "value": new_hash.decode("utf-8")}).execute()
    except Exception as e:
        logging.error(f"Error saving pin_hash to Supabase: {e}")

def get_real_ip(request: Request) -> str:
    # Confía en request.client.host de forma segura cuando hay proxies configurados (como Render/Vercel)
    if request.client and request.client.host:
        return request.client.host
    return "unknown"

limiter = Limiter(key_func=get_real_ip)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://braimar.onrender.com wss:; img-src 'self' data:"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logging.error("Validation error on %s: %s", request.url, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

def _allowed_origins() -> list[str]:
    base = [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://frontend.localhost", "https://frontend.localhost",
        "http://braimar-backend.localhost", "https://braimar-backend.localhost",
    ]
    raw = os.getenv("FRONTEND_URL", "")
    for url in raw.split(","):
        url = url.strip()
        if url:
            base.append(url)
    return base

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

class PinRequest(BaseModel):
    pin: str

class ChangePinRequest(BaseModel):
    current_pin: str
    new_pin: str

class HoraExtra(BaseModel):
    colaborador_id: str
    fecha: str          # YYYY-MM-DD
    horas: float
    hora_inicio: Optional[str] = None  # HH:MM
    hora_fin: Optional[str] = None     # HH:MM

class Colaborador(BaseModel):
    nombre: str
    apellido: str
    cedula: str
    telefono: str
    correo: str = ''
    fecha_ingreso: str   # ISO format: YYYY-MM-DD
    tipo_turno: str      # "completo" | "medio"
    sueldo: float = 0.0  # Sueldo base en USD
    bono_alimentacion: float = 40.0  # Bono de alimentación en USD
    bonos: float = 120.0  # Otros bonos en USD

class EnviarReciboRequest(BaseModel):
    email_destinatario: str
    nombre_colaborador: str
    periodo: str
    pdf_base64: str

class GuardarPagoRequest(BaseModel):
    colaborador_id: str
    desde: str        # YYYY-MM-DD
    hasta: str        # YYYY-MM-DD
    total: float      # sueldo quincenal + bono
    pdf_base64: str

def _read_colaboradores() -> list:
    try:
        response = supabase.table("colaboradores").select("*").execute()
        return response.data or []
    except Exception as e:
        logging.warning(f"Supabase colaboradores no disponible, usando JSON local: {e}")
        try:
            if COLABORADORES_FILE.exists():
                return json.loads(COLABORADORES_FILE.read_text(encoding="utf-8"))
        except Exception as je:
            logging.error(f"Error leyendo colaboradores.json: {je}")
        return []

def _write_colaboradores_local(data: list) -> None:
    COLABORADORES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _read_pagos_index() -> list:
    try:
        response = supabase.table("pagos").select("*").execute()
        return response.data or []
    except Exception as e:
        logging.error(f"Error reading pagos from Supabase: {e}")
        return []

def _read_horas_extras() -> list:
    try:
        response = supabase.table("horas_extras").select("*").execute()
        return response.data or []
    except Exception as e:
        logging.warning(f"Supabase horas_extras no disponible, usando JSON local: {e}")
        try:
            if HORAS_EXTRAS_FILE.exists():
                return json.loads(HORAS_EXTRAS_FILE.read_text(encoding="utf-8"))
        except Exception as je:
            logging.error(f"Error leyendo horas_extras.json: {je}")
        return []

def _write_horas_extras_local(data: list) -> None:
    HORAS_EXTRAS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

@app.get("/health")
async def health_check():
    """Endpoint público para keep-alive y monitoreo. No requiere autenticación."""
    try:
        supabase.table("settings").select("key").limit(1).execute()
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {str(e)[:80]}"
    return {"status": "ok", "db": db_status}

@app.get("/me")
async def check_session(braimar_session: Optional[str] = Cookie(default=None)):
    """Verifica si la sesión actual sigue siendo válida. Usado por el frontend al recargar."""
    if verify_session(braimar_session):
        return {"authenticated": True}
    raise HTTPException(status_code=401, detail="Sesión inválida o expirada")


@app.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, response: Response, payload: PinRequest):
    current_hash = get_pin_hash()
    
    # 1. Intentamos verificar con Pepper (pimienta)
    try:
        is_valid = bcrypt.checkpw(f"{payload.pin}{PEPPER_KEY}".encode('utf-8'), current_hash)
    except Exception:
        is_valid = False
        
    # 2. Si no es válido, intentamos el chequeo legado (sin Pepper) para migración
    if not is_valid:
        try:
            is_legacy_valid = bcrypt.checkpw(payload.pin.encode('utf-8'), current_hash)
            if is_legacy_valid:
                # Migración transparente al nuevo PIN encriptado con Pepper
                new_peppered_hash = bcrypt.hashpw(f"{payload.pin}{PEPPER_KEY}".encode('utf-8'), bcrypt.gensalt(12))
                set_pin_hash(new_peppered_hash)
                is_valid = True
                logging.info("PIN migrado exitosamente con la nueva encriptación (Pepper).")
        except Exception as e:
            logging.error(f"Error durante migración de PIN: {e}")

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized"
        )

    # Generar un session_id único y registrarlo como sesión activa
    session_id = str(uuid.uuid4())
    set_active_session_id(session_id)

    expire = datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    token_data = {"sub": "braimar_admin", "session_id": session_id, "exp": expire}
    encoded_jwt = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

    response.set_cookie(
        key="braimar_session",
        value=encoded_jwt,
        httponly=True,
        secure=(ENVIRONMENT == "production"),
        samesite="none" if ENVIRONMENT == "production" else "lax",
        max_age=12 * 3600,
        expires=expire.strftime("%a, %d-%b-%Y %T GMT")
    )

    # Devolver el token en el body para que el frontend pueda guardarlo en localStorage
    # Esto permite autenticacion por Authorization header, evitando problemas de cookies en proxies
    return {"status": "ok", "token": encoded_jwt}


@app.get("/bcv-rate")
async def bcv_rate():
    cache = _load_bcv_cache()

    if cache and _is_cache_valid(cache):
        return {
            "valor": cache["valor"],
            "fecha_valor": cache.get("fecha_valor", ""),
            "hora_cache": cache.get("hora_cache", ""),
            "desde_cache": True,
        }

    try:
        data = await _scrape_bcv_usd()
        saved = _save_bcv_cache(data["valor"], data["fecha_valor"])
        return {
            "valor": data["valor"],
            "fecha_valor": data["fecha_valor"],
            "hora_cache": saved["hora_cache"],
            "desde_cache": False,
        }
    except Exception:
        if cache:
            return {
                "valor": cache["valor"],
                "fecha_valor": cache.get("fecha_valor", ""),
                "hora_cache": cache.get("hora_cache", ""),
                "desde_cache": True,
                "stale": True,
            }
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener la tasa BCV"
        )


@app.get("/colaboradores")
async def get_colaboradores(braimar_session: Optional[str] = Cookie(default=None)):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    return _read_colaboradores()

@app.post("/colaboradores", status_code=201)
async def create_colaborador(
    payload: Colaborador,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    nuevo = payload.model_dump()
    nuevo["id"] = str(uuid.uuid4())
    try:
        response = supabase.table("colaboradores").insert(nuevo).execute()
        return response.data[0]
    except Exception as e:
        logging.warning(f"Supabase insert colaboradores falló, guardando en JSON local: {e}")
        colabs = _read_colaboradores()
        colabs.append(nuevo)
        _write_colaboradores_local(colabs)
        return nuevo

@app.put("/colaboradores/{colaborador_id}")
async def update_colaborador(
    colaborador_id: str,
    payload: Colaborador,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    updated = payload.model_dump()
    try:
        response = supabase.table("colaboradores").update(updated).eq("id", colaborador_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Colaborador no encontrado")
        return response.data[0]
    except Exception as e:
        logging.warning(f"Supabase update colaboradores falló, actualizando JSON local: {e}")
        colabs = _read_colaboradores()
        for i, c in enumerate(colabs):
            if c["id"] == colaborador_id:
                updated["id"] = colaborador_id
                colabs[i] = updated
                _write_colaboradores_local(colabs)
                return updated
        raise HTTPException(status_code=404, detail="Colaborador no encontrado")

@app.delete("/colaboradores/{colaborador_id}", status_code=204)
async def delete_colaborador(
    colaborador_id: str,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    
    # 1. Obtener pagos asociados para borrar sus PDFs en Supabase Storage
    try:
        pagos_resp = supabase.table("pagos").select("id").eq("colaborador_id", colaborador_id).execute()
        if pagos_resp.data:
            archivos_pdf = [f"{p['id']}.pdf" for p in pagos_resp.data]
            supabase.storage.from_("pagos").remove(archivos_pdf)
    except Exception as e:
        logging.error(f"Error borrando PDFs asociados al colaborador {colaborador_id}: {e}")

    # 2. Borrar el colaborador (los pagos se borran por CASCADE en la base de datos)
    try:
        response = supabase.table("colaboradores").delete().eq("id", colaborador_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Colaborador no encontrado")
    except Exception as e:
        logging.warning(f"Supabase delete colaboradores falló, eliminando del JSON local: {e}")
        colabs = _read_colaboradores()
        nuevos = [c for c in colabs if c["id"] != colaborador_id]
        if len(nuevos) == len(colabs):
            raise HTTPException(status_code=404, detail="Colaborador no encontrado")
        _write_colaboradores_local(nuevos)

@app.post("/pagos", status_code=201)
async def guardar_pago(
    payload: GuardarPagoRequest,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")

    pago_id = str(uuid.uuid4())
    pdf_bytes = base64.b64decode(payload.pdf_base64)
    
    # Subir PDF a Supabase Storage
    try:
        supabase.storage.from_("pagos").upload(
            f"{pago_id}.pdf", 
            pdf_bytes, 
            file_options={"content-type": "application/pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error subiendo PDF: {str(e)}")

    now = _vet_now()
    entrada = {
        "id": pago_id,
        "colaborador_id": payload.colaborador_id,
        "desde": payload.desde,
        "hasta": payload.hasta,
        "total": payload.total,
        "fecha_generado": now.strftime("%Y-%m-%d"),
        "hora_generado": now.strftime("%H:%M:%S"),
    }
    
    # Guardar registro en base de datos
    try:
        supabase.table("pagos").insert(entrada).execute()
    except Exception as e:
        # Intento de rollback: borrar PDF subido
        supabase.storage.from_("pagos").remove([f"{pago_id}.pdf"])
        raise HTTPException(status_code=500, detail=f"Error guardando registro de pago: {str(e)}")

    return entrada

@app.get("/pagos")
async def listar_pagos(
    colaborador_id: str = Query(...),
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    index = _read_pagos_index()
    pagos = [p for p in index if p["colaborador_id"] == colaborador_id]
    pagos.sort(key=lambda p: (p["fecha_generado"], p.get("hora_generado", "")), reverse=True)
    return pagos

@app.get("/pagos/{pago_id}/pdf")
async def obtener_pdf(
    pago_id: str,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    
    try:
        pdf_bytes = supabase.storage.from_("pagos").download(f"{pago_id}.pdf")
        return Response(content=pdf_bytes, media_type="application/pdf", headers={
            "Content-Disposition": f'inline; filename="recibo_{pago_id}.pdf"'
        })
    except Exception as e:
        raise HTTPException(status_code=404, detail="PDF no encontrado o error en Supabase")

@app.delete("/pagos/{pago_id}", status_code=204)
async def delete_pago(
    pago_id: str,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    
    # 1. Borrar PDF del almacenamiento
    try:
        supabase.storage.from_("pagos").remove([f"{pago_id}.pdf"])
    except Exception as e:
        logging.error(f"Error borrando PDF del pago {pago_id} de Supabase Storage: {e}")

    # 2. Borrar registro de la base de datos
    try:
        response = supabase.table("pagos").delete().eq("id", pago_id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Pago no encontrado")
    except Exception as e:
        logging.error(f"Error borrando pago {pago_id} de Supabase: {e}")
        raise HTTPException(status_code=500, detail=f"Error al borrar el pago: {e}")

@app.get("/finanzas")
async def get_finanzas(braimar_session: Optional[str] = Cookie(default=None)):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")

    index = _read_pagos_index()
    colaboradores = _read_colaboradores()
    colab_map = {c["id"]: f"{c['nombre']} {c['apellido']}" for c in colaboradores}

    # Agrupar por (desde, hasta)
    grupos: dict = {}
    for p in index:
        key = f"{p['desde']}|{p['hasta']}"
        if key not in grupos:
            grupos[key] = {"desde": p["desde"], "hasta": p["hasta"], "pagos": []}
        grupos[key]["pagos"].append(p)

    resultado = []
    for grupo in grupos.values():
        items = []
        total_quincena = 0.0
        for p in grupo["pagos"]:
            t = p.get("total", 0.0)
            total_quincena += t
            items.append({
                "nombre": colab_map.get(p["colaborador_id"], "Colaborador eliminado"),
                "total": t,
                "fecha_generado": p["fecha_generado"],
                "hora_generado": p.get("hora_generado", ""),
            })
        items.sort(key=lambda x: x["total"], reverse=True)
        resultado.append({
            "desde": grupo["desde"],
            "hasta": grupo["hasta"],
            "total": round(total_quincena, 2),
            "cantidad": len(items),
            "pagos": items,
        })

    resultado.sort(key=lambda x: x["hasta"], reverse=True)
    return resultado

@app.post("/webauthn/register/begin")
async def wn_register_begin(
    request: Request,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")

    rp_id, _ = get_client_rp(request)
    rp_name   = os.getenv("RP_NAME", "La Casa del Encaje")

    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=rp_name,
        user_id=b"braimar_admin",
        user_name="admin",
        user_display_name="Administrador",
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.REQUIRED,
            resident_key=ResidentKeyRequirement.PREFERRED,
        ),
    )
    _wn_challenge["value"]   = options.challenge
    _wn_challenge["expires"] = time.time() + 300
    return json.loads(options_to_json(options))


@app.post("/webauthn/register/complete")
async def wn_register_complete(
    request: Request,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")

    challenge = _wn_challenge.get("value")
    if not challenge or time.time() > _wn_challenge.get("expires", 0):
        raise HTTPException(status_code=400, detail="Desafío expirado. Inténtalo de nuevo.")

    rp_id, rp_origin = get_client_rp(request)
    body = await request.json()

    try:
        cred = RegistrationCredential(
            id=body["id"],
            raw_id=base64url_to_bytes(body["rawId"]),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(body["response"]["clientDataJSON"]),
                attestation_object=base64url_to_bytes(body["response"]["attestationObject"]),
            ),
            type=body.get("type", "public-key"),
        )
        verification = verify_registration_response(
            credential=cred,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=rp_origin,
            require_user_verification=True,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verificación fallida: {e}")

    wn_data = json.dumps({
        "credential_id": bytes_to_base64url(verification.credential_id),
        "public_key":    bytes_to_base64url(verification.credential_public_key),
        "sign_count":    verification.sign_count,
    })
    _save_webauthn(wn_data)
    _wn_challenge.clear()
    return {"status": "ok"}


def _load_webauthn() -> dict | None:
    try:
        resp = supabase.table("settings").select("value").eq("key", "webauthn_credential").execute()
        if resp.data:
            return json.loads(resp.data[0]["value"])
    except Exception as e:
        logging.error(f"Error loading webauthn from Supabase: {e}")
    
    # Fallback local
    try:
        path = Path(__file__).parent / "webauthn.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logging.error(f"Error loading webauthn from local JSON: {e}")
    return None

def _save_webauthn(wn_data: str):
    # 1. Intentar guardar en Supabase
    try:
        supabase.table("settings").upsert({"key": "webauthn_credential", "value": wn_data}).execute()
    except Exception as e:
        logging.error(f"Error saving webauthn to Supabase settings: {e}")
    
    # 2. Siempre guardar en local JSON como respaldo
    try:
        path = Path(__file__).parent / "webauthn.json"
        path.write_text(wn_data, encoding="utf-8")
    except Exception as e:
        logging.error(f"Error saving webauthn to local JSON: {e}")

@app.post("/webauthn/auth/begin")
async def wn_auth_begin(request: Request):
    cred_data = _load_webauthn()
    if not cred_data:
        raise HTTPException(status_code=404, detail="Sin biometría registrada")
    rp_id, _ = get_client_rp(request)

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(cred_data["credential_id"]))
        ],
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    _wn_challenge["value"]   = options.challenge
    _wn_challenge["expires"] = time.time() + 300
    return json.loads(options_to_json(options))


@app.post("/webauthn/auth/complete")
async def wn_auth_complete(request: Request, response: Response):
    cred_data = _load_webauthn()
    if not cred_data:
        raise HTTPException(status_code=404, detail="Sin biometría registrada")

    challenge = _wn_challenge.get("value")
    if not challenge or time.time() > _wn_challenge.get("expires", 0):
        raise HTTPException(status_code=400, detail="Desafío expirado. Inténtalo de nuevo.")
    
    rp_id, rp_origin = get_client_rp(request)
    body = await request.json()

    try:
        cred = AuthenticationCredential(
            id=body["id"],
            raw_id=base64url_to_bytes(body["rawId"]),
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(body["response"]["clientDataJSON"]),
                authenticator_data=base64url_to_bytes(body["response"]["authenticatorData"]),
                signature=base64url_to_bytes(body["response"]["signature"]),
                user_handle=(
                    base64url_to_bytes(body["response"]["userHandle"])
                    if body["response"].get("userHandle") else None
                ),
            ),
            type=body.get("type", "public-key"),
        )
        verification = verify_authentication_response(
            credential=cred,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=rp_origin,
            credential_public_key=base64url_to_bytes(cred_data["public_key"]),
            credential_current_sign_count=cred_data["sign_count"],
            require_user_verification=True,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Verificación fallida: {e}")

    # Actualizar sign count
    cred_data["sign_count"] = verification.new_sign_count
    _save_webauthn(json.dumps(cred_data))
    _wn_challenge.clear()

    # Generar un session_id único y registrarlo como sesión activa
    session_id = str(uuid.uuid4())
    set_active_session_id(session_id)

    # Crear sesión JWT
    expire      = datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    encoded_jwt = jwt.encode({"sub": "braimar_admin", "session_id": session_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
    response.set_cookie(
        key="braimar_session", value=encoded_jwt,
        httponly=True, secure=(ENVIRONMENT == "production"),
        samesite="none" if ENVIRONMENT == "production" else "lax", max_age=12 * 3600,
        expires=expire.strftime("%a, %d-%b-%Y %T GMT"),
    )
    return {"status": "ok"}


@app.delete("/webauthn", status_code=204)
async def wn_delete(braimar_session: Optional[str] = Cookie(default=None)):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    try:
        supabase.table("settings").delete().eq("key", "webauthn_credential").execute()
    except Exception as e:
        logging.error(f"Error deleting webauthn from Supabase: {e}")
    try:
        path = Path(__file__).parent / "webauthn.json"
        if path.exists():
            path.unlink()
    except Exception as e:
        logging.error(f"Error deleting local webauthn file: {e}")


@app.post("/enviar-recibo")
async def enviar_recibo(
    payload: EnviarReciboRequest,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")

    gmail_user = os.getenv("GMAIL_USER")
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD")

    if not gmail_user or not gmail_pass:
        raise HTTPException(status_code=503, detail="Configuración de correo no disponible en el servidor")

    msg = MIMEMultipart()
    msg["From"] = gmail_user
    msg["To"] = payload.email_destinatario
    msg["Subject"] = f"Recibo de pago – {payload.nombre_colaborador} – {payload.periodo}"

    cuerpo = (
        f"Estimado/a {payload.nombre_colaborador},\n\n"
        f"Adjunto encontrará su recibo de pago correspondiente al período: {payload.periodo}.\n\n"
        f"Atentamente,\nLa Casa del Encaje"
    )
    msg.attach(MIMEText(cuerpo, "plain", "utf-8"))

    pdf_bytes = base64.b64decode(payload.pdf_base64)
    part = MIMEBase("application", "octet-stream")
    part.set_payload(pdf_bytes)
    email_encoders.encode_base64(part)
    nombre_archivo = f"recibo_{payload.nombre_colaborador.replace(' ', '_')}_{payload.periodo}.pdf"
    part.add_header("Content-Disposition", f'attachment; filename="{nombre_archivo}"')
    msg.attach(part)

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
            server.login(gmail_user, gmail_pass)
            server.send_message(msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al enviar el correo: {e}")

    return {"status": "ok"}


def verify_session(token: Optional[str]) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("sub") != "braimar_admin":
            return False
        
        token_session_id = payload.get("session_id")
        active_session_id = get_active_session_id()
        if active_session_id is None:
            return True
        return token_session_id == active_session_id
    except Exception:
        return False

def get_token(braimar_session: Optional[str] = None, authorization: Optional[str] = None) -> Optional[str]:
    """Extrae el token de Authorization header o cookie. Prioriza el header Bearer."""
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return braimar_session

@app.post("/change-pin")
@limiter.limit("10/minute")
async def change_pin(
    request: Request,
    payload: ChangePinRequest,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada"
        )

    if len(payload.new_pin) != 6 or not payload.new_pin.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nuevo PIN debe tener exactamente 6 dígitos"
        )

    current_hash = get_pin_hash()
    
    # 1. Intentamos verificar con Pepper
    try:
        is_valid = bcrypt.checkpw(f"{payload.current_pin}{PEPPER_KEY}".encode('utf-8'), current_hash)
    except Exception:
        is_valid = False

    # 2. Si falla, probamos el chequeo legado (sin Pepper) para migración
    if not is_valid:
        try:
            is_legacy_valid = bcrypt.checkpw(payload.current_pin.encode('utf-8'), current_hash)
            if is_legacy_valid:
                is_valid = True
        except Exception:
            pass

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El PIN actual es incorrecto"
        )

    new_hash = bcrypt.hashpw(f"{payload.new_pin}{PEPPER_KEY}".encode('utf-8'), bcrypt.gensalt(12))
    set_pin_hash(new_hash)

    return {"status": "ok"}


@app.get("/horas-extras")
async def get_horas_extras(
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    return _read_horas_extras()

@app.post("/horas-extras", status_code=201)
async def create_hora_extra(
    payload: HoraExtra,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    
    nuevo = payload.model_dump()
    nuevo["id"] = str(uuid.uuid4())
    now = _vet_now()
    nuevo["fecha_generado"] = now.strftime("%Y-%m-%d")
    nuevo["hora_generado"] = now.strftime("%H:%M:%S")
    
    try:
        response = supabase.table("horas_extras").insert(nuevo).execute()
        return response.data[0]
    except Exception as e:
        logging.warning(f"Supabase horas_extras insert falló, guardando en JSON local: {e}")
        extras = _read_horas_extras()
        extras.append(nuevo)
        _write_horas_extras_local(extras)
        return nuevo

@app.put("/horas-extras/{id}")
async def update_hora_extra(
    id: str,
    payload: HoraExtra,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    
    updated = payload.model_dump()
    try:
        response = supabase.table("horas_extras").update(updated).eq("id", id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.warning(f"Supabase horas_extras update falló, actualizando JSON local: {e}")
        extras = _read_horas_extras()
        for i, h in enumerate(extras):
            if h["id"] == id:
                updated["id"] = id
                updated["fecha_generado"] = h.get("fecha_generado", _vet_now().strftime("%Y-%m-%d"))
                updated["hora_generado"] = h.get("hora_generado", _vet_now().strftime("%H:%M:%S"))
                extras[i] = updated
                _write_horas_extras_local(extras)
                return extras[i]
        raise HTTPException(status_code=404, detail="Registro no encontrado")

@app.delete("/horas-extras/{id}", status_code=204)
async def delete_hora_extra(
    id: str,
    braimar_session: Optional[str] = Cookie(default=None)
):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    
    try:
        response = supabase.table("horas_extras").delete().eq("id", id).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
    except HTTPException:
        raise
    except Exception as e:
        logging.warning(f"Supabase horas_extras delete falló, eliminando del JSON local: {e}")
        extras = _read_horas_extras()
        nuevos = [h for h in extras if h["id"] != id]
        if len(nuevos) == len(extras):
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        _write_horas_extras_local(nuevos)

