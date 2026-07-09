from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.concurrency import run_in_threadpool
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


@app.get("/workspaces/{workspace_id}/members")
def list_workspace_members(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        resp = (
            supabase.table("workspace_members")
            .select("user_id, users(email)")
            .eq("workspace_id", workspace_id)
            .execute()
        )
        members = [
            {"user_id": m["user_id"], "email": (m.get("users") or {}).get("email")}
            for m in (resp.data or [])
        ]
        return members
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Retro sessions
# ---------------------------------------------------------------------------


def ensure_workspace_member(workspace_id: str, user_id: str):
    resp = (
        supabase.table("workspace_members")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")


def ensure_session_member(session_id: str, user_id: str):
    resp = (
        supabase.table("session_members")
        .select("id")
        .eq("session_id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=403, detail="Not a member of this session")


def get_session_or_404(session_id: str) -> dict:
    resp = supabase.table("sessions").select("*").eq("id", session_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return resp.data[0]


class SessionCreateIn(BaseModel):
    name: str
    member_ids: list[str] = []


class SessionMembersIn(BaseModel):
    member_ids: list[str]


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(session_id, []).append(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        conns = self.active_connections.get(session_id)
        if conns and websocket in conns:
            conns.remove(websocket)
            if not conns:
                del self.active_connections[session_id]

    async def broadcast(self, session_id: str, message: dict):
        conns = list(self.active_connections.get(session_id, []))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(session_id, ws)


manager = ConnectionManager()


@app.post("/workspaces/{workspace_id}/sessions")
def create_session(
    workspace_id: str, payload: SessionCreateIn, current_user: dict = Depends(get_current_user)
):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Session name is required")

        member_ids = set(payload.member_ids) | {current_user["id"]}
        for uid in member_ids:
            ensure_workspace_member(workspace_id, uid)

        insert = {
            "workspace_id": workspace_id,
            "name": name,
            "created_by": current_user["id"],
            "status": "active",
        }
        res = supabase.table("sessions").insert(insert).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create session")
        session = res.data[0]

        rows = [{"session_id": session["id"], "user_id": uid} for uid in member_ids]
        supabase.table("session_members").insert(rows).execute()

        return session
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/workspaces/{workspace_id}/sessions")
def list_sessions(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        resp = (
            supabase.table("sessions")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .execute()
        )
        return resp.data or []
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/sessions/{session_id}/members")
def add_session_members(
    session_id: str, payload: SessionMembersIn, current_user: dict = Depends(get_current_user)
):
    try:
        session = get_session_or_404(session_id)
        if session["created_by"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only the session creator can add members")

        for uid in payload.member_ids:
            ensure_workspace_member(session["workspace_id"], uid)

        existing = (
            supabase.table("session_members").select("user_id").eq("session_id", session_id).execute()
        )
        existing_ids = {m["user_id"] for m in (existing.data or [])}
        new_rows = [
            {"session_id": session_id, "user_id": uid}
            for uid in payload.member_ids
            if uid not in existing_ids
        ]
        if new_rows:
            supabase.table("session_members").insert(new_rows).execute()

        members = (
            supabase.table("session_members").select("user_id").eq("session_id", session_id).execute()
        )
        return members.data or []
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/sessions/{session_id}")
def get_session_detail(session_id: str, current_user: dict = Depends(get_current_user)):
    try:
        session = get_session_or_404(session_id)
        ensure_session_member(session_id, current_user["id"])

        cards = (
            supabase.table("cards").select("*").eq("session_id", session_id).order("created_at").execute()
        ).data or []

        vote_map: dict[str, list[str]] = {}
        if cards:
            votes = (
                supabase.table("votes")
                .select("card_id,user_id")
                .in_("card_id", [c["id"] for c in cards])
                .execute()
            ).data or []
            for v in votes:
                vote_map.setdefault(v["card_id"], []).append(v["user_id"])

        for c in cards:
            c["votes"] = vote_map.get(c["id"], [])
            c["vote_count"] = len(c["votes"])

        members = (
            supabase.table("session_members").select("user_id").eq("session_id", session_id).execute()
        ).data or []

        return {
            "session": session,
            "cards": cards,
            "members": [m["user_id"] for m in members],
        }
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/sessions/{session_id}/end")
async def end_session(session_id: str, current_user: dict = Depends(get_current_user)):
    try:
        session = await run_in_threadpool(get_session_or_404, session_id)
        if session["created_by"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only the session creator can end the session")

        res = await run_in_threadpool(
            lambda: supabase.table("sessions").update({"status": "ended"}).eq("id", session_id).execute()
        )
        updated = res.data[0] if res.data else {**session, "status": "ended"}

        await manager.broadcast(session_id, {"type": "session_ended", "session": updated})
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.websocket("/ws/sessions/{session_id}")
async def session_websocket(websocket: WebSocket, session_id: str, token: str = Query(...)):
    payload = verify_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=4401)
        return
    user_id = payload["sub"]

    try:
        session = await run_in_threadpool(get_session_or_404, session_id)
    except HTTPException:
        await websocket.close(code=4404)
        return

    member_resp = await run_in_threadpool(
        lambda: supabase.table("session_members")
        .select("id")
        .eq("session_id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not member_resp.data:
        await websocket.close(code=4403)
        return

    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if session["status"] != "active":
                await websocket.send_json({"type": "error", "message": "This session has ended"})
                continue

            if msg_type == "add_card":
                text = (data.get("text") or "").strip()
                color = (data.get("color") or "").strip()
                if not text or not color:
                    await websocket.send_json(
                        {"type": "error", "message": "text and color are required"}
                    )
                    continue

                res = await run_in_threadpool(
                    lambda: supabase.table("cards")
                    .insert({"session_id": session_id, "text": text, "color": color, "created_by": user_id})
                    .execute()
                )
                card = res.data[0]
                card["votes"] = []
                card["vote_count"] = 0
                await manager.broadcast(session_id, {"type": "card_added", "card": card})

            elif msg_type == "toggle_vote":
                card_id = data.get("card_id")
                if not card_id:
                    await websocket.send_json({"type": "error", "message": "card_id is required"})
                    continue

                existing = await run_in_threadpool(
                    lambda: supabase.table("votes")
                    .select("id")
                    .eq("card_id", card_id)
                    .eq("user_id", user_id)
                    .execute()
                )
                if existing.data:
                    await run_in_threadpool(
                        lambda: supabase.table("votes")
                        .delete()
                        .eq("card_id", card_id)
                        .eq("user_id", user_id)
                        .execute()
                    )
                else:
                    await run_in_threadpool(
                        lambda: supabase.table("votes")
                        .insert({"card_id": card_id, "user_id": user_id})
                        .execute()
                    )

                votes_resp = await run_in_threadpool(
                    lambda: supabase.table("votes").select("user_id").eq("card_id", card_id).execute()
                )
                voters = [v["user_id"] for v in (votes_resp.data or [])]
                await manager.broadcast(
                    session_id,
                    {"type": "vote_updated", "card_id": card_id, "votes": voters, "vote_count": len(voters)},
                )

            else:
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown message type: {msg_type}"}
                )
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session_id, websocket)
