import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

                                                                       

_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"), None)


def _clean_url(value):
    """Pasted URLs often carry leading/trailing spaces, newlines or zero-width characters."""
    if isinstance(value, str):
        return value.translate(_INVISIBLE).strip()
    return value


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    email: EmailStr


class AuthSessionOut(BaseModel):
    user: UserOut
    session_token: str


class GoogleCredentialIn(BaseModel):
    credential: str = Field(min_length=20, max_length=10000)



                                                                             

class KeyValueIn(BaseModel):
    key: str = ""
    value: str = ""
    enabled: bool = True


                                                                           

class AssertionIn(BaseModel):
    kind: Literal["status", "exists", "equals", "latency"]
    path: str = ""
    expected: str = ""
    enabled: bool = True


class AssertionOut(AssertionIn):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


                                                                           

class AuthConfigIn(BaseModel):
    type: Literal["none", "bearer", "basic", "apikey"] = "none"
    token: str = ""
    username: str = ""
    password: str = ""
    key: str = ""
    value: str = ""
    in_: Literal["header", "query"] = Field("header", alias="in")

    model_config = ConfigDict(populate_by_name=True)


                                                                             

class RequestIn(BaseModel):
    name: str = "Untitled request"
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET"
    url: str = ""
    params: list[KeyValueIn] = Field(default_factory=list)
    headers: list[KeyValueIn] = Field(default_factory=list)
    auth: AuthConfigIn = Field(default_factory=AuthConfigIn)
    body: str = ""
    assertions: list[AssertionIn] = []
    collection_id: uuid.UUID | None = None

    @field_validator("url", mode="before")
    @classmethod
    def _strip_url(cls, v):
        return _clean_url(v)



class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    method: str
    url: str
    params: list[dict]
    headers: list[dict]
    auth: dict
    body: str
    collection_id: uuid.UUID | None
    assertions: list[AssertionOut]
    updated_at: datetime


                                                                             

class CollectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class CollectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    requests: list[RequestOut] = Field(default_factory=list)


                                                                             

class EnvironmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class EnvVariableIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    value: str = ""
    secret: bool = False

    @field_validator("name")
    @classmethod
    def no_braces(cls, v: str) -> str:
        if "{{" in v or "}}" in v:
            raise ValueError("Variable names should not include {{ }} — just the name inside them.")
        return v


class EnvVariablesIn(BaseModel):
    variables: list[EnvVariableIn]


class EnvVariableOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    value: str
    secret: bool


class EnvironmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    variables: list[EnvVariableOut] = Field(default_factory=list)


                                                                          

class ExecuteIn(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    url: str
    params: list[KeyValueIn] = Field(default_factory=list)
    headers: list[KeyValueIn] = Field(default_factory=list)
    auth: AuthConfigIn = Field(default_factory=AuthConfigIn)
    body: str = ""
    environment_id: uuid.UUID | None = None
    request_id: uuid.UUID | None = None

    @field_validator("url", mode="before")
    @classmethod
    def _strip_url(cls, v):
        return _clean_url(v)



class ErrorExplainIn(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    url: str = Field(min_length=1, max_length=2000)
    status: int | None = Field(default=None, ge=100, le=599)
    status_text: str = Field(default="", max_length=120)
    error_message: str = Field(default="", max_length=2000)
    response_body: str = Field(default="", max_length=6000)
    local: bool = False

    @field_validator("url", mode="before")
    @classmethod
    def _strip_url(cls, v):
        return _clean_url(v)



class ErrorExplainOut(BaseModel):
    title: str
    summary: str
    likely_cause: str
    next_steps: list[str]
    confidence: Literal["high", "medium", "low"]


class ExecuteOut(BaseModel):
    status: int
    status_text: str
    duration_ms: int
    size_bytes: int
    headers: dict[str, str]
    body: str
    truncated: bool = False


                                                                           

class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    method: str
    url: str
    status: int | None
    duration_ms: int | None
    used_local_request: bool
    created_at: datetime
    request: RequestOut | None = None


class HistoryPageOut(BaseModel):
    items: list[HistoryOut]
    total: int
    page: int
    page_size: int
    has_more: bool


class MethodBreakdownOut(BaseModel):
    method: str
    count: int


class StatusBreakdownOut(BaseModel):
    class_: str = Field(alias="class")
    count: int

    model_config = {"populate_by_name": True}


class OverviewOut(BaseModel):
    request_count: int
    history_count: int
    environment_count: int
    success_rate: float | None = None
    avg_duration_ms: int | None = None
    sends_last_7d: int = 0
    daily_sends: list[int] = []
    daily_avg_ms: list[int | None] = []
    method_breakdown: list[MethodBreakdownOut] = []
    status_breakdown: list[StatusBreakdownOut] = []
    fastest_ms: int | None = None
    slowest_ms: int | None = None
    recent: list[HistoryOut]
