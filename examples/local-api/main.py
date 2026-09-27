from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from pydantic import BaseModel

app = FastAPI(title="Outpath Local LNA Demo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://outpath.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def local_network_cors(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin")
    if origin in {
        "https://outpath.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    } and (request.method == "OPTIONS" or request.headers.get("access-control-request-private-network") == "true"):
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


class EchoIn(BaseModel):
    name: str
    value: int = 1


@app.get("/api/test")
def get_test():
    return {"ok": True, "message": "Outpath LNA local request works."}


@app.post("/api/echo")
def echo(payload: EchoIn):
    return {"ok": True, "received": payload.model_dump()}
