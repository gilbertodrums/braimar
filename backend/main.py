from fastapi import FastAPI, HTTPException, Request, Response, status, Query
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

PIN_FILE = Path(__file__).parent / "pin.json"
BCV_CACHE_FILE = Path(__file__).parent / "bcv_cache.json"
WEBAUTHN_FILE = Path(__file__).parent / "webauthn.json"

# Challenge temporal en memoria (sistema monousuario)
_wn_challenge: dict = {}  # {"value": bytes, "expires": float}

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
    if PIN_FILE.exists():
        data = json.loads(PIN_FILE.read_text())
        return data["hash"].encode('utf-8')
    # Primera ejecucion: crear el archivo con el PIN por defecto (052026)
    default_hash = bcrypt.hashpw(b"052026", bcrypt.gensalt(12))
    PIN_FILE.write_text(json.dumps({"hash": default_hash.decode('utf-8')}))
    return default_hash

def set_pin_hash(new_hash: bytes):
    PIN_FILE.write_text(json.dumps({"hash": new_hash.decode('utf-8')}))

limiter = Limiter(key_func=get_remote_address)

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://frontend.localhost", "https://frontend.localhost",
        "http://braimar-backend.localhost", "https://braimar-backend.localhost",
        os.getenv("FRONTEND_URL", "http://localhost:5173")
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

class PinRequest(BaseModel):
    pin: str

class ChangePinRequest(BaseModel):
    current_pin: str
    new_pin: str

class Colaborador(BaseModel):
    nombre: str
    apellido: str
    cedula: str
    telefono: str
    correo: str = ''
    fecha_ingreso: str   # ISO format: YYYY-MM-DD
    tipo_turno: str      # "completo" | "medio"
    sueldo: float = 0.0  # Sueldo en bolívares

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
        logging.error(f"Error reading from Supabase: {e}")
        return []

def _read_pagos_index() -> list:
    try:
        response = supabase.table("pagos").select("*").execute()
        return response.data or []
    except Exception as e:
        logging.error(f"Error reading pagos from Supabase: {e}")
        return []

@app.get("/me")
async def check_session(braimar_session: Optional[str] = Cookie(default=None)):
    """Verifica si la sesión actual sigue siendo válida. Usado por el frontend al recargar."""
    if verify_session(braimar_session):
        return {"authenticated": True}
    raise HTTPException(status_code=401, detail="Sesión inválida o expirada")


@app.post("/login")
@limiter.limit("5/15minute")
async def login(request: Request, response: Response, payload: PinRequest):
    try:
        is_valid = bcrypt.checkpw(payload.pin.encode('utf-8'), get_pin_hash())
    except Exception:
        is_valid = False

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized"
        )

    expire = datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    token_data = {"sub": "braimar_admin", "exp": expire}
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

    return {"status": "ok"}


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
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

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
async def wn_register_begin(braimar_session: Optional[str] = Cookie(default=None)):
    if not verify_session(braimar_session):
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")

    rp_id     = os.getenv("RP_ID", "localhost")
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

    rp_id    = os.getenv("RP_ID", "localhost")
    rp_origin = os.getenv("RP_ORIGIN", "http://localhost:5173")
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

    WEBAUTHN_FILE.write_text(json.dumps({
        "credential_id": bytes_to_base64url(verification.credential_id),
        "public_key":    bytes_to_base64url(verification.credential_public_key),
        "sign_count":    verification.sign_count,
    }))
    _wn_challenge.clear()
    return {"status": "ok"}


@app.post("/webauthn/auth/begin")
async def wn_auth_begin():
    if not WEBAUTHN_FILE.exists():
        raise HTTPException(status_code=404, detail="Sin biometría registrada")

    cred_data = json.loads(WEBAUTHN_FILE.read_text())
    rp_id     = os.getenv("RP_ID", "localhost")

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
    if not WEBAUTHN_FILE.exists():
        raise HTTPException(status_code=404, detail="Sin biometría registrada")

    challenge = _wn_challenge.get("value")
    if not challenge or time.time() > _wn_challenge.get("expires", 0):
        raise HTTPException(status_code=400, detail="Desafío expirado. Inténtalo de nuevo.")

    cred_data  = json.loads(WEBAUTHN_FILE.read_text())
    rp_id      = os.getenv("RP_ID", "localhost")
    rp_origin  = os.getenv("RP_ORIGIN", "http://localhost:5173")
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
    WEBAUTHN_FILE.write_text(json.dumps(cred_data))
    _wn_challenge.clear()

    # Crear sesión JWT
    expire      = datetime.datetime.utcnow() + datetime.timedelta(hours=12)
    encoded_jwt = jwt.encode({"sub": "braimar_admin", "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
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
    if WEBAUTHN_FILE.exists():
        WEBAUTHN_FILE.unlink()


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
        return payload.get("sub") == "braimar_admin"
    except Exception:
        return False

@app.post("/change-pin")
@limiter.limit("5/15minute")
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

    try:
        is_valid = bcrypt.checkpw(payload.current_pin.encode('utf-8'), get_pin_hash())
    except Exception:
        is_valid = False

    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El PIN actual es incorrecto"
        )

    new_hash = bcrypt.hashpw(payload.new_pin.encode('utf-8'), bcrypt.gensalt(12))
    set_pin_hash(new_hash)

    return {"status": "ok"}

