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
from openai import OpenAI

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# AI summary generation is a nice-to-have on top of ending a session — if no key is
# configured we simply skip generating a summary rather than failing startup.
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:5174", "http://localhost:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignupIn(BaseModel):
    name: str
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
        insert = {"name": payload.name, "email": payload.email, "password": hashed}
        res = supabase.table("users").insert(insert).execute()
        # Supabase returns data on success
        if not res.data or len(res.data) == 0:
            raise HTTPException(status_code=500, detail="Failed to create user")

        user = res.data[0]
        token = create_access_token(
            {"sub": str(user.get("id")), "email": user.get("email"), "name": user.get("name")}
        )
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/login")
def login(payload: LoginIn):
    try:
        resp = (
            supabase.table("users")
            .select("id,email,password,name")
            .eq("email", payload.email)
            .execute()
        )
        if not resp.data or len(resp.data) == 0:
            raise HTTPException(status_code=400, detail="Invalid credentials")
        user = resp.data[0]
        stored = user.get("password")
        if not stored or not bcrypt.checkpw(payload.password.encode(), stored.encode()):
            raise HTTPException(status_code=400, detail="Invalid credentials")
        token = create_access_token(
            {"sub": str(user.get("id")), "email": user.get("email"), "name": user.get("name")}
        )
        return {"access_token": token, "token_type": "bearer", "name": user.get("name")}
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
    return {"id": payload["sub"], "email": payload.get("email"), "name": payload.get("name")}


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
            .select("user_id, users(email, name)")
            .eq("workspace_id", workspace_id)
            .execute()
        )
        members = [
            {
                "user_id": m["user_id"],
                "email": (m.get("users") or {}).get("email"),
                "name": (m.get("users") or {}).get("name"),
            }
            for m in (resp.data or [])
        ]
        return members
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        resp = supabase.table("workspaces").select("id,created_by").eq("id", workspace_id).execute()
        if not resp.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        workspace = resp.data[0]
        if workspace["created_by"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only the workspace creator can delete it")

        supabase.table("workspaces").delete().eq("id", workspace_id).execute()
        workspace_presence.pop(workspace_id, None)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/workspaces/{workspace_id}/leave")
def leave_workspace(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        resp = supabase.table("workspaces").select("id,created_by").eq("id", workspace_id).execute()
        if not resp.data:
            raise HTTPException(status_code=404, detail="Workspace not found")
        workspace = resp.data[0]
        if workspace["created_by"] == current_user["id"]:
            raise HTTPException(
                status_code=400,
                detail="The workspace creator can't leave — delete the workspace instead",
            )
        ensure_workspace_member(workspace_id, current_user["id"])

        supabase.table("workspace_members").delete().eq("workspace_id", workspace_id).eq(
            "user_id", current_user["id"]
        ).execute()
        bucket = workspace_presence.get(workspace_id)
        if bucket:
            bucket.pop(current_user["id"], None)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Workspace presence (lightweight in-memory "who's online" heartbeat)
# ---------------------------------------------------------------------------

PRESENCE_ONLINE_WINDOW_SECONDS = 30

workspace_presence: dict[str, dict[str, dict]] = {}


@app.post("/workspaces/{workspace_id}/presence/ping")
def ping_workspace_presence(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        bucket = workspace_presence.setdefault(workspace_id, {})
        bucket[current_user["id"]] = {
            "user_id": current_user["id"],
            "name": current_user.get("name") or current_user.get("email"),
            "last_seen": datetime.utcnow(),
        }
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/workspaces/{workspace_id}/presence")
def get_workspace_presence(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        bucket = workspace_presence.get(workspace_id, {})
        cutoff = datetime.utcnow() - timedelta(seconds=PRESENCE_ONLINE_WINDOW_SECONDS)
        online = [
            {"user_id": v["user_id"], "name": v["name"]}
            for v in bucket.values()
            if v["last_seen"] >= cutoff
        ]
        return online
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


CARD_COLORS = {"#bbf7d0", "#fef08a", "#fecaca", "#bfdbfe", "#e9d5ff", "#fbcfe8"}
REACTION_EMOJIS = {"👍", "❤️", "😂", "🔥", "💡"}


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
            "color_labels": {},
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


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    try:
        session = get_session_or_404(session_id)
        if session["created_by"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only the session creator can delete this session")

        supabase.table("sessions").delete().eq("id", session_id).execute()
        return {"success": True}
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

        reaction_map: dict[str, dict[str, list[str]]] = {}
        if cards:
            reactions = (
                supabase.table("card_reactions")
                .select("card_id,user_id,emoji")
                .in_("card_id", [c["id"] for c in cards])
                .execute()
            ).data or []
            for r in reactions:
                by_emoji = reaction_map.setdefault(r["card_id"], {})
                by_emoji.setdefault(r["emoji"], []).append(r["user_id"])

        for c in cards:
            c["votes"] = vote_map.get(c["id"], [])
            c["vote_count"] = len(c["votes"])
            c["reactions"] = reaction_map.get(c["id"], {})

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


SUMMARY_SYSTEM_PROMPT = (
    "You are an assistant that summarizes agile retrospective sessions for a software team. "
    "You will be given the name of a retro session and the sticky-note cards written by the team. "
    "Respond with plain text in exactly this format, with each bullet on its own line starting with '- ':\n\n"
    "What went well:\n- ...\n\n"
    "What didn't go well:\n- ...\n\n"
    "Key action items:\n- ...\n\n"
    "Keep each section to at most 5 bullets, synthesizing similar cards together rather than listing every "
    "card verbatim. If a section has nothing relevant, write '- Nothing noted' under it. Do not add any other "
    "headers, preamble, or commentary."
)


def generate_session_summary(session_name: str, cards: list[dict]) -> str | None:
    if not openai_client or not cards:
        return None
    try:
        card_lines = "\n".join(f"- {c['text']}" for c in cards[:200] if c.get("text"))
        if not card_lines:
            return None
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": f"Retro session: {session_name}\n\nCards:\n{card_lines}"},
            ],
        )
        content = completion.choices[0].message.content
        return content.strip() if content else None
    except Exception:
        traceback.print_exc()
        return None


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

        cards_res = await run_in_threadpool(
            lambda: supabase.table("cards").select("*").eq("session_id", session_id).execute()
        )
        summary = await run_in_threadpool(
            generate_session_summary, updated.get("name"), cards_res.data or []
        )
        if summary:
            summary_res = await run_in_threadpool(
                lambda: supabase.table("sessions").update({"summary": summary}).eq("id", session_id).execute()
            )
            updated = summary_res.data[0] if summary_res.data else {**updated, "summary": summary}

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
                card["reactions"] = {}
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

            elif msg_type == "toggle_reaction":
                card_id = data.get("card_id")
                emoji = data.get("emoji")
                if not card_id or emoji not in REACTION_EMOJIS:
                    await websocket.send_json(
                        {"type": "error", "message": "card_id and a valid emoji are required"}
                    )
                    continue

                existing = await run_in_threadpool(
                    lambda: supabase.table("card_reactions")
                    .select("id")
                    .eq("card_id", card_id)
                    .eq("user_id", user_id)
                    .eq("emoji", emoji)
                    .execute()
                )
                if existing.data:
                    await run_in_threadpool(
                        lambda: supabase.table("card_reactions")
                        .delete()
                        .eq("card_id", card_id)
                        .eq("user_id", user_id)
                        .eq("emoji", emoji)
                        .execute()
                    )
                else:
                    await run_in_threadpool(
                        lambda: supabase.table("card_reactions")
                        .insert({"card_id": card_id, "user_id": user_id, "emoji": emoji})
                        .execute()
                    )

                reactions_resp = await run_in_threadpool(
                    lambda: supabase.table("card_reactions")
                    .select("user_id,emoji")
                    .eq("card_id", card_id)
                    .execute()
                )
                grouped: dict[str, list[str]] = {}
                for r in reactions_resp.data or []:
                    grouped.setdefault(r["emoji"], []).append(r["user_id"])
                await manager.broadcast(
                    session_id,
                    {"type": "reaction_updated", "card_id": card_id, "reactions": grouped},
                )

            elif msg_type == "update_color_labels":
                if session["created_by"] != user_id:
                    await websocket.send_json(
                        {"type": "error", "message": "Only the session creator can edit color meanings"}
                    )
                    continue

                raw_labels = data.get("color_labels") or {}
                if not isinstance(raw_labels, dict):
                    await websocket.send_json({"type": "error", "message": "Invalid color_labels"})
                    continue

                color_labels = {
                    color: str(label).strip()
                    for color, label in raw_labels.items()
                    if color in CARD_COLORS and str(label).strip()
                }

                res = await run_in_threadpool(
                    lambda: supabase.table("sessions")
                    .update({"color_labels": color_labels})
                    .eq("id", session_id)
                    .execute()
                )
                if res.data:
                    session = res.data[0]
                await manager.broadcast(
                    session_id, {"type": "color_labels_updated", "color_labels": color_labels}
                )

            else:
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown message type: {msg_type}"}
                )
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(session_id, websocket)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

ACTION_ITEM_COLOR = "#e9d5ff"  # purple — matches the "Purple" swatch on the retro board


def get_card_or_404(card_id: str) -> dict:
    resp = supabase.table("cards").select("*").eq("id", card_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Card not found")
    return resp.data[0]


@app.delete("/cards/{card_id}")
async def delete_card(card_id: str, current_user: dict = Depends(get_current_user)):
    try:
        card = await run_in_threadpool(get_card_or_404, card_id)
        if card["created_by"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only the card creator can delete this card")

        await run_in_threadpool(
            lambda: supabase.table("cards").delete().eq("id", card_id).execute()
        )

        await manager.broadcast(card["session_id"], {"type": "card_deleted", "card_id": card_id})
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


class CardResolvedIn(BaseModel):
    resolved: bool


@app.get("/workspaces/{workspace_id}/dashboard")
def get_workspace_dashboard(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])

        sessions = (
            supabase.table("sessions")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("created_at", desc=True)
            .execute()
        ).data or []

        session_names = {s["id"]: s["name"] for s in sessions}
        past_sessions = [s for s in sessions if s["status"] == "ended"]

        action_items = []
        if sessions:
            cards = (
                supabase.table("cards")
                .select("*")
                .eq("color", ACTION_ITEM_COLOR)
                .in_("session_id", list(session_names.keys()))
                .order("created_at", desc=True)
                .execute()
            ).data or []
            for c in cards:
                action_items.append(
                    {
                        "id": c["id"],
                        "text": c["text"],
                        "resolved": c.get("resolved", False),
                        "session_id": c["session_id"],
                        "session_name": session_names.get(c["session_id"], "Unknown session"),
                        "created_at": c["created_at"],
                    }
                )

        return {"past_sessions": past_sessions, "action_items": action_items}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.patch("/cards/{card_id}/resolved")
def set_card_resolved(
    card_id: str, payload: CardResolvedIn, current_user: dict = Depends(get_current_user)
):
    try:
        card = get_card_or_404(card_id)
        session = get_session_or_404(card["session_id"])
        ensure_workspace_member(session["workspace_id"], current_user["id"])

        res = (
            supabase.table("cards")
            .update({"resolved": payload.resolved})
            .eq("id", card_id)
            .execute()
        )
        return res.data[0] if res.data else {**card, "resolved": payload.resolved}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Daily standups
# ---------------------------------------------------------------------------


class StandupIn(BaseModel):
    yesterday: str
    today: str
    blockers: str = ""


def get_standup_or_404(standup_id: str) -> dict:
    resp = supabase.table("standups").select("*").eq("id", standup_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Standup not found")
    return resp.data[0]


@app.post("/workspaces/{workspace_id}/standups")
def post_standup(
    workspace_id: str, payload: StandupIn, current_user: dict = Depends(get_current_user)
):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])

        yesterday = payload.yesterday.strip()
        today = payload.today.strip()
        blockers = payload.blockers.strip()
        if not yesterday or not today:
            raise HTTPException(status_code=400, detail="Both yesterday and today fields are required")

        today_date = datetime.utcnow().date().isoformat()

        existing = (
            supabase.table("standups")
            .select("id")
            .eq("workspace_id", workspace_id)
            .eq("user_id", current_user["id"])
            .eq("date", today_date)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=400,
                detail="You already posted today's standup. Edit it instead.",
            )

        insert = {
            "workspace_id": workspace_id,
            "user_id": current_user["id"],
            "user_name": current_user.get("name") or current_user.get("email"),
            "yesterday": yesterday,
            "today": today,
            "blockers": blockers,
            "date": today_date,
        }
        res = supabase.table("standups").insert(insert).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to post standup")
        return res.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/workspaces/{workspace_id}/standups")
def get_todays_standups(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        today_date = datetime.utcnow().date().isoformat()
        resp = (
            supabase.table("standups")
            .select("*")
            .eq("workspace_id", workspace_id)
            .eq("date", today_date)
            .order("created_at")
            .execute()
        )
        return resp.data or []
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/workspaces/{workspace_id}/standups/history")
def get_standup_history(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        resp = (
            supabase.table("standups")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("date", desc=True)
            .execute()
        )
        grouped: dict[str, list[dict]] = {}
        for s in resp.data or []:
            grouped.setdefault(s["date"], []).append(s)

        history = [{"date": d, "standups": items} for d, items in sorted(grouped.items(), reverse=True)]
        return history
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/standups/{standup_id}")
def edit_standup(standup_id: str, payload: StandupIn, current_user: dict = Depends(get_current_user)):
    try:
        standup = get_standup_or_404(standup_id)
        if standup["user_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="You can only edit your own standup")

        yesterday = payload.yesterday.strip()
        today = payload.today.strip()
        blockers = payload.blockers.strip()
        if not yesterday or not today:
            raise HTTPException(status_code=400, detail="Both yesterday and today fields are required")

        update = {
            "yesterday": yesterday,
            "today": today,
            "blockers": blockers,
            "updated_at": datetime.utcnow().isoformat(),
        }
        res = supabase.table("standups").update(update).eq("id", standup_id).execute()
        return res.data[0] if res.data else {**standup, **update}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Focus sessions
# ---------------------------------------------------------------------------

FOCUS_STATUSES = {"working", "break", "done"}

focus_manager = ConnectionManager()


class FocusSessionCreateIn(BaseModel):
    goal: str
    duration_minutes: int


class FocusJoinIn(BaseModel):
    goal: str


class FocusStatusIn(BaseModel):
    status: str | None = None
    completed: bool | None = None


def get_focus_session_or_404(session_id: str) -> dict:
    resp = supabase.table("focus_sessions").select("*").eq("id", session_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Focus session not found")
    return resp.data[0]


def get_focus_participants(session_id: str) -> list:
    resp = (
        supabase.table("focus_participants")
        .select("*")
        .eq("focus_session_id", session_id)
        .execute()
    )
    return resp.data or []


def get_focus_participant_or_403(session_id: str, user_id: str) -> dict:
    resp = (
        supabase.table("focus_participants")
        .select("*")
        .eq("focus_session_id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=403, detail="You have not joined this focus session")
    return resp.data[0]


def focus_session_deadline_passed(session: dict) -> bool:
    started_at = datetime.fromisoformat(str(session["started_at"]).replace("Z", "+00:00"))
    deadline = started_at + timedelta(minutes=session["duration_minutes"])
    return datetime.now(started_at.tzinfo) >= deadline


@app.post("/workspaces/{workspace_id}/focus-sessions")
def create_focus_session(
    workspace_id: str, payload: FocusSessionCreateIn, current_user: dict = Depends(get_current_user)
):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])

        goal = payload.goal.strip()
        if not goal:
            raise HTTPException(status_code=400, detail="Goal is required")
        if payload.duration_minutes < 1 or payload.duration_minutes > 480:
            raise HTTPException(status_code=400, detail="Duration must be between 1 and 480 minutes")

        insert = {
            "workspace_id": workspace_id,
            "goal": goal,
            "duration_minutes": payload.duration_minutes,
            "status": "active",
            "created_by": current_user["id"],
        }
        res = supabase.table("focus_sessions").insert(insert).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create focus session")
        session = res.data[0]

        participant_res = (
            supabase.table("focus_participants")
            .insert(
                {
                    "focus_session_id": session["id"],
                    "user_id": current_user["id"],
                    "user_name": current_user.get("name") or current_user.get("email"),
                    "goal": goal,
                    "status": "working",
                    "completed": False,
                }
            )
            .execute()
        )

        return {"session": session, "participants": participant_res.data or []}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/workspaces/{workspace_id}/focus-sessions")
def list_focus_sessions(workspace_id: str, current_user: dict = Depends(get_current_user)):
    try:
        ensure_workspace_member(workspace_id, current_user["id"])
        sessions = (
            supabase.table("focus_sessions")
            .select("*")
            .eq("workspace_id", workspace_id)
            .order("started_at", desc=True)
            .execute()
        ).data or []

        participants_by_session: dict[str, list[dict]] = {}
        if sessions:
            participants = (
                supabase.table("focus_participants")
                .select("*")
                .in_("focus_session_id", [s["id"] for s in sessions])
                .execute()
            ).data or []
            for p in participants:
                participants_by_session.setdefault(p["focus_session_id"], []).append(p)

        for s in sessions:
            s["participants"] = participants_by_session.get(s["id"], [])

        return sessions
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/focus-sessions/{session_id}")
def get_focus_session_detail(session_id: str, current_user: dict = Depends(get_current_user)):
    try:
        session = get_focus_session_or_404(session_id)
        ensure_workspace_member(session["workspace_id"], current_user["id"])
        participants = get_focus_participants(session_id)
        return {"session": session, "participants": participants}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/focus-sessions/{session_id}/join")
async def join_focus_session(
    session_id: str, payload: FocusJoinIn, current_user: dict = Depends(get_current_user)
):
    try:
        session = await run_in_threadpool(get_focus_session_or_404, session_id)
        await run_in_threadpool(ensure_workspace_member, session["workspace_id"], current_user["id"])

        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="This focus session has ended")

        goal = payload.goal.strip()
        if not goal:
            raise HTTPException(status_code=400, detail="Goal is required")

        existing = await run_in_threadpool(
            lambda: supabase.table("focus_participants")
            .select("*")
            .eq("focus_session_id", session_id)
            .eq("user_id", current_user["id"])
            .execute()
        )
        if existing.data:
            res = await run_in_threadpool(
                lambda: supabase.table("focus_participants")
                .update({"goal": goal})
                .eq("id", existing.data[0]["id"])
                .execute()
            )
            participant = res.data[0] if res.data else {**existing.data[0], "goal": goal}
        else:
            res = await run_in_threadpool(
                lambda: supabase.table("focus_participants")
                .insert(
                    {
                        "focus_session_id": session_id,
                        "user_id": current_user["id"],
                        "user_name": current_user.get("name") or current_user.get("email"),
                        "goal": goal,
                        "status": "working",
                        "completed": False,
                    }
                )
                .execute()
            )
            participant = res.data[0]

        await focus_manager.broadcast(session_id, {"type": "participant_joined", "participant": participant})
        return participant
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.put("/focus-sessions/{session_id}/status")
async def update_focus_status(
    session_id: str, payload: FocusStatusIn, current_user: dict = Depends(get_current_user)
):
    try:
        await run_in_threadpool(get_focus_session_or_404, session_id)
        participant = await run_in_threadpool(
            get_focus_participant_or_403, session_id, current_user["id"]
        )

        update = {}
        if payload.status is not None:
            if payload.status not in FOCUS_STATUSES:
                raise HTTPException(status_code=400, detail="Invalid status")
            update["status"] = payload.status
        if payload.completed is not None:
            update["completed"] = payload.completed
        if not update:
            raise HTTPException(status_code=400, detail="Nothing to update")

        res = await run_in_threadpool(
            lambda: supabase.table("focus_participants")
            .update(update)
            .eq("id", participant["id"])
            .execute()
        )
        updated = res.data[0] if res.data else {**participant, **update}

        await focus_manager.broadcast(session_id, {"type": "status_updated", "participant": updated})
        return updated
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/focus-sessions/{session_id}/end")
async def end_focus_session(session_id: str, current_user: dict = Depends(get_current_user)):
    try:
        session = await run_in_threadpool(get_focus_session_or_404, session_id)
        await run_in_threadpool(ensure_workspace_member, session["workspace_id"], current_user["id"])

        if session["status"] == "ended":
            participants = await run_in_threadpool(get_focus_participants, session_id)
            return {"session": session, "participants": participants}

        is_creator = session["created_by"] == current_user["id"]
        if not is_creator and not focus_session_deadline_passed(session):
            raise HTTPException(status_code=403, detail="Only the creator can end this session early")

        res = await run_in_threadpool(
            lambda: supabase.table("focus_sessions")
            .update({"status": "ended", "ended_at": datetime.utcnow().isoformat()})
            .eq("id", session_id)
            .execute()
        )
        updated = res.data[0] if res.data else {**session, "status": "ended"}
        participants = await run_in_threadpool(get_focus_participants, session_id)

        await focus_manager.broadcast(
            session_id, {"type": "session_ended", "session": updated, "participants": participants}
        )
        return {"session": updated, "participants": participants}
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


@app.websocket("/ws/focus/{session_id}")
async def focus_websocket(websocket: WebSocket, session_id: str, token: str = Query(...)):
    payload = verify_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=4401)
        return
    user_id = payload["sub"]

    try:
        await run_in_threadpool(get_focus_session_or_404, session_id)
    except HTTPException:
        await websocket.close(code=4404)
        return

    participant_resp = await run_in_threadpool(
        lambda: supabase.table("focus_participants")
        .select("id")
        .eq("focus_session_id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not participant_resp.data:
        await websocket.close(code=4403)
        return

    await focus_manager.connect(session_id, websocket)
    try:
        session = await run_in_threadpool(get_focus_session_or_404, session_id)
        participants = await run_in_threadpool(get_focus_participants, session_id)
        await websocket.send_json({"type": "sync", "session": session, "participants": participants})

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            session = await run_in_threadpool(get_focus_session_or_404, session_id)

            if msg_type == "update_status":
                if session["status"] != "active":
                    await websocket.send_json({"type": "error", "message": "This focus session has ended"})
                    continue
                status = data.get("status")
                if status not in FOCUS_STATUSES:
                    await websocket.send_json({"type": "error", "message": "Invalid status"})
                    continue
                res = await run_in_threadpool(
                    lambda: supabase.table("focus_participants")
                    .update({"status": status})
                    .eq("focus_session_id", session_id)
                    .eq("user_id", user_id)
                    .execute()
                )
                if res.data:
                    await focus_manager.broadcast(
                        session_id, {"type": "status_updated", "participant": res.data[0]}
                    )

            elif msg_type == "mark_completed":
                completed = bool(data.get("completed"))
                res = await run_in_threadpool(
                    lambda: supabase.table("focus_participants")
                    .update({"completed": completed})
                    .eq("focus_session_id", session_id)
                    .eq("user_id", user_id)
                    .execute()
                )
                if res.data:
                    await focus_manager.broadcast(
                        session_id, {"type": "status_updated", "participant": res.data[0]}
                    )

            elif msg_type == "end_session":
                if session["status"] != "active":
                    continue
                is_creator = session["created_by"] == user_id
                if not is_creator and not focus_session_deadline_passed(session):
                    await websocket.send_json(
                        {"type": "error", "message": "Only the creator can end this session early"}
                    )
                    continue
                res = await run_in_threadpool(
                    lambda: supabase.table("focus_sessions")
                    .update({"status": "ended", "ended_at": datetime.utcnow().isoformat()})
                    .eq("id", session_id)
                    .execute()
                )
                updated = res.data[0] if res.data else {**session, "status": "ended"}
                participants = await run_in_threadpool(get_focus_participants, session_id)
                await focus_manager.broadcast(
                    session_id,
                    {"type": "session_ended", "session": updated, "participants": participants},
                )

            else:
                await websocket.send_json(
                    {"type": "error", "message": f"Unknown message type: {msg_type}"}
                )
    except WebSocketDisconnect:
        pass
    finally:
        focus_manager.disconnect(session_id, websocket)
