from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import os
from supabase import create_client
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
import traceback
import secrets
import string

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://localhost:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignupIn(BaseModel):
    email: EmailStr
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def create_access_token(data: dict, expires_delta: int = 60 * 60 * 24):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(seconds=expires_delta)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


@app.get("/")
def read_root():
    return {"message": "hello from backend"}


@app.post("/signup")
def signup(payload: SignupIn):
    try:
        resp = supabase.table("users").select("id,email").eq("email", payload.email).execute()
        if resp.data and len(resp.data) > 0:
            raise HTTPException(status_code=400, detail="User already exists")

        hashed = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
        insert = {"email": payload.email, "password": hashed}
        res = supabase.table("users").insert(insert).execute()
        # Supabase returns data on success
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create user")

        user = res.data[0]
        token = create_access_token({"sub": str(user.get("id")), "email": user.get("email")})
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/login")
def login(payload: LoginIn):
    try:
        resp = supabase.table("users").select("id,email,password").eq("email", payload.email).execute()
        if not resp.data or len(resp.data) == 0:
            raise HTTPException(status_code=400, detail="Invalid credentials")
        user = resp.data[0]
        stored = user.get("password")
        if not stored or not bcrypt.checkpw(payload.password.encode(), stored.encode()):
            raise HTTPException(status_code=400, detail="Invalid credentials")
        token = create_access_token({"sub": str(user.get("id")), "email": user.get("email")})
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


def verify_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


# ---------------------------------------------------------------------------
# Workspaces
# ---------------------------------------------------------------------------

bearer_scheme = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    payload = verify_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"id": payload["sub"], "email": payload.get("email")}


class WorkspaceCreateIn(BaseModel):
    name: str


class WorkspaceJoinIn(BaseModel):
    invite_code: str


def generate_unique_invite_code(length: int = 7) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(20):
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        existing = supabase.table("workspaces").select("id").eq("invite_code", code).execute()
        if not existing.data:
            return code
    raise HTTPException(status_code=500, detail="Failed to generate a unique invite code")


@app.post("/workspaces")
def create_workspace(payload: WorkspaceCreateIn, current_user: dict = Depends(get_current_user)):
    try:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Workspace name is required")

        invite_code = generate_unique_invite_code()
        insert = {"name": name, "invite_code": invite_code, "created_by": current_user["id"]}
        res = supabase.table("workspaces").insert(insert).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create workspace")
        workspace = res.data[0]

        supabase.table("workspace_members").insert(
            {"workspace_id": workspace["id"], "user_id": current_user["id"]}
        ).execute()

        return workspace
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/workspaces/join")
def join_workspace(payload: WorkspaceJoinIn, current_user: dict = Depends(get_current_user)):
    try:
        code = payload.invite_code.strip().upper()
        if not code:
            raise HTTPException(status_code=400, detail="Invite code is required")

        resp = supabase.table("workspaces").select("*").eq("invite_code", code).execute()
        if not resp.data:
            raise HTTPException(status_code=404, detail="Invalid invite code")
        workspace = resp.data[0]

        existing = (
            supabase.table("workspace_members")
            .select("id")
            .eq("workspace_id", workspace["id"])
            .eq("user_id", current_user["id"])
            .execute()
        )
        if not existing.data:
            supabase.table("workspace_members").insert(
                {"workspace_id": workspace["id"], "user_id": current_user["id"]}
            ).execute()

        return workspace
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/workspaces")
def list_workspaces(current_user: dict = Depends(get_current_user)):
    try:
        memberships = (
            supabase.table("workspace_members")
            .select("workspace_id")
            .eq("user_id", current_user["id"])
            .execute()
        )
        workspace_ids = [m["workspace_id"] for m in (memberships.data or [])]
        if not workspace_ids:
            return []

        resp = supabase.table("workspaces").select("*").in_("id", workspace_ids).execute()
        return resp.data or []
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))
