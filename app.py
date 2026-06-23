from fastapi import FastAPI
app = FastAPI()
@app.get("/")
def root():
    return {"status": "connections-game stub", "oauth_callback": "/auth/discord/callback"}
@app.get("/auth/discord/callback")
def cb(code: str = "", state: str = ""):
    return {"stub": True, "code": code}
