from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import os
from supabase import create_client
import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
import traceback

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
