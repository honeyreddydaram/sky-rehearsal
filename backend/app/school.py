"""School workflows. All access is checked here; clients cannot write school documents."""
import hashlib
import json
import math
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore, storage
from google.api_core.exceptions import AlreadyExists
from pydantic import BaseModel, ConfigDict, Field, model_validator


def identifier(value):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise HTTPException(422, "Use an ID with letters, numbers, underscores or hyphens")
    return value


def now():
    return datetime.now(timezone.utc).isoformat()


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class Performance(Input):
    version: Literal[1]
    typeCode: Literal["c152", "c172r", "c172s", "da42ng"]
    source: str = Field(min_length=1, max_length=200)
    reference: str = Field(min_length=1, max_length=200)
    reviewedBy: str = Field(min_length=1, max_length=100)
    bankDeg: float = Field(ge=5, le=30)
    phaseSpeedsKias: dict[str, float]

    @model_validator(mode="after")
    def speeds(self):
        if set(self.phaseSpeedsKias) != {"takeoff", "upwind", "crosswind", "downwind", "base", "final", "landing"} or not all(30 <= v <= 200 for v in self.phaseSpeedsKias.values()):
            raise ValueError("Supply all seven phase speeds in KIAS (30–200)")
        return self


class Scenario(Input):
    title: str = Field(min_length=1, max_length=120)
    airport: Literal["VOHY"] = "VOHY"
    runway: Literal["27", "09"]
    aircraft: Literal["demo", "c152", "c172r", "c172s", "da42ng"]
    performance: Performance | None = None
    weather: Literal["calm", "westerly", "crosswind"]
    windFrom: int = Field(ge=0, le=360)
    windSpeed: int = Field(ge=0, le=35)
    mode: Literal["landmarks", "decisions", "quiz", "exam"]
    difficulty: Literal["beginner", "intermediate", "advanced", "examiner"]
    requiredScore: int = Field(ge=0, le=100)
    notes: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def aircraft_data(self):
        if (self.aircraft == "demo" and self.performance is not None) or (self.aircraft != "demo" and (self.performance is None or self.performance.typeCode != self.aircraft)):
            raise ValueError("Attach matching reviewed performance inputs or explicitly choose demo aircraft")
        return self


class Member(Input):
    name: str = Field(min_length=1, max_length=80)
    role: Literal["student", "instructor"]
    instructorUid: str | None = Field(default=None, max_length=128)


class Assignment(Input):
    scenarioId: str = Field(min_length=1, max_length=128)
    studentUid: str = Field(min_length=1, max_length=128)


class Submission(Input):
    sessionId: str = Field(min_length=1, max_length=128)
    trackId: str | None = Field(default=None, max_length=128)


class Review(Input):
    status: Literal["reviewed", "needs_practice"]
    notes: str = Field(min_length=1, max_length=2000)


class School:
    def __init__(self, application, user, school_id):
        self.application, self.user = application, user
        self.db = firestore.client(app=application)
        self.ref = self.db.collection("schools").document(identifier(school_id))
        self.member = self.ref.collection("members").document(user["uid"]).get().to_dict()
        if not self.member or not self.member.get("active"):
            raise HTTPException(403, "Active school membership required")
        self.role = self.member["role"]
        self.admin = self.role == "school_admin" and user["role"] in {"school_admin", "platform_admin"}
        self.staff = self.admin or self.role == "instructor" and user["role"] in {"instructor", "school_admin", "platform_admin"}
        if self.role != "student" and not self.staff:
            raise HTTPException(403, "Trusted instructor role required; sign in again after a role change")

    def require_staff(self):
        if not self.staff:
            raise HTTPException(403, "Instructor access required")

    def get(self, collection, key):
        result = self.ref.collection(collection).document(identifier(key)).get().to_dict()
        if result is None:
            raise HTTPException(404, "School record not found")
        return result

    def student(self, uid):
        member = self.get("members", uid)
        if not member.get("active") or member["role"] != "student" or not (self.admin or self.staff and member.get("instructorUid") == self.user["uid"] or uid == self.user["uid"]):
            raise HTTPException(403, "Student is outside your teaching roster")
        return member

    def listing(self, collection, maximum):
        docs = list(self.ref.collection(collection).limit(maximum + 1).stream())
        if len(docs) > maximum:
            raise HTTPException(413, "School exceeds this beta dashboard's limit; pagination is required")
        return [{**doc.to_dict(), "id": doc.id} for doc in docs]

    def dashboard(self):
        members = self.listing("members", 100)
        students = [m for m in members if m.get("active") and m["role"] == "student" and (self.admin or self.staff and m.get("instructorUid") == self.user["uid"] or m["id"] == self.user["uid"])]
        allowed = {m["id"] for m in students}
        scenarios = self.listing("scenarios", 100)
        assignments = [a for a in self.listing("assignments", 200) if a["studentUid"] in allowed]
        submissions = [s for s in self.listing("submissions", 300) if s["studentUid"] in allowed]
        return {"role": self.role, "admin": self.admin, "staff": self.staff, "students": students,
                "instructors": [m for m in members if m.get("active") and m["role"] in {"instructor", "school_admin"}] if self.admin else [],
                "scenarios": scenarios if self.staff else [], "assignments": assignments, "submissions": submissions}

    def member_write(self, uid, data):
        if not self.admin:
            raise HTTPException(403, "School administrator required")
        identifier(uid)
        existing = self.ref.collection("members").document(uid).get().to_dict()
        if uid == self.user["uid"] or existing and existing.get("role") == "school_admin":
            raise HTTPException(403, "Administrator memberships are managed by a trusted operator")
        try:
            auth.get_user(uid, app=self.application)
        except auth.UserNotFoundError:
            raise HTTPException(404, "Account does not exist") from None
        if data.role == "student":
            mentor = self.get("members", identifier(data.instructorUid or ""))
            if not mentor.get("active") or mentor["role"] not in {"instructor", "school_admin"}:
                raise HTTPException(422, "Choose an active school instructor")
        elif data.instructorUid is not None:
            raise HTTPException(422, "Only student memberships have an instructor")
        self.ref.collection("members").document(uid).set({**data.model_dump(), "active": True})
        return {"status": "saved"}

    def create_scenario(self, data):
        self.require_staff()
        key = uuid.uuid4().hex
        self.ref.collection("scenarios").document(key).create({"config": data.model_dump(), "state": "draft", "createdBy": self.user["uid"], "createdAt": now()})
        return {"id": key}

    def publish(self, key):
        self.require_staff()
        scenario = self.get("scenarios", key)
        if not self.admin and scenario["createdBy"] != self.user["uid"]:
            raise HTTPException(403, "Only the author or school administrator can publish this draft")
        Scenario.model_validate(scenario["config"])
        self.ref.collection("scenarios").document(key).update({"state": "published"})
        return {"status": "published"}

    def assign(self, data):
        self.require_staff()
        self.student(identifier(data.studentUid))
        scenario = self.get("scenarios", data.scenarioId)
        if scenario["state"] != "published":
            raise HTTPException(409, "Publish and review the scenario before assigning it")
        key = uuid.uuid4().hex
        self.ref.collection("assignments").document(key).create({"scenarioId": data.scenarioId, "studentUid": data.studentUid,
            "config": scenario["config"], "assignedBy": self.user["uid"], "assignedAt": now()})
        return {"id": key}

    def submit(self, assignment_id, data):
        assignment = self.get("assignments", assignment_id)
        if self.role != "student" or assignment["studentUid"] != self.user["uid"]:
            raise HTTPException(403, "Only the assigned student can submit work")
        self.student(self.user["uid"])
        session = self.db.collection("users").document(self.user["uid"]).collection("sessions").document(identifier(data.sessionId)).get().to_dict()
        if not session:
            raise HTTPException(404, "Sync the completed session to your account before submitting")
        config = assignment["config"]
        tag = {"schoolId": self.ref.id, "assignmentId": assignment_id}
        expected_weather = {"calm": (1013.25, 15), "westerly": (1008, 30), "crosswind": (1016, 25)}[config["weather"]]
        weather = session.get("environment", {}).get("weather", {})
        aircraft = session.get("environment", {}).get("aircraft")
        try:
            completed = datetime.fromisoformat(session["completedAt"].replace("Z", "+00:00"))
            dates_ok = datetime.fromisoformat(assignment["assignedAt"]) <= completed <= datetime.now(timezone.utc) + timedelta(minutes=5)
        except (ValueError, KeyError, TypeError):
            dates_ok = False
        if not dates_ok or session.get("assignment") != tag or any(session.get(k) != v for k, v in {
            "route": "circuit" + config["runway"], "mode": config["mode"], "difficulty": config["difficulty"],
            "windFrom": config["windFrom"], "windSpeed": config["windSpeed"], "correctWind": True,
            "total": 5}.items()) or (weather.get("qnh"), weather.get("temperature")) != expected_weather or aircraft != config["performance"]:
            raise HTTPException(409, "Session does not match the assigned scenario; launch and complete this assignment")
        answers = session.get("answers", [])
        if not isinstance(answers, list) or len(answers) != 5 or any(not isinstance(a, dict) for a in answers) or {a.get("index") for a in answers} != set(range(5)) or any(type(a.get("passed")) is not bool for a in answers):
            raise HTTPException(422, "A complete five-checkpoint session is required")
        score = sum(a["passed"] for a in answers) * 20
        report = session.get("debrief")
        try:
            report_size = len(json.dumps(report, allow_nan=False))
        except (TypeError, ValueError):
            raise HTTPException(422, "Debrief is not a supported JSON report") from None
        if report_size > 64000:
            raise HTTPException(422, "Debrief is too large to share")
        track = None
        if data.trackId:
            track_id = identifier(data.trackId)
            metadata = self.db.collection("users").document(self.user["uid"]).collection("tracks").document(track_id).get().to_dict()
            if not metadata or metadata.get("path") != f"users/{self.user['uid']}/tracks/{track_id}.json":
                raise HTTPException(404, "Owned recording not found")
            reference = metadata.get("reference")
            offset = metadata.get("geoidOffsetM")
            if reference not in {"MSL", "ELLIPSOID"} or (reference == "MSL" and offset is None) or (offset is not None and (type(offset) not in {int, float} or not math.isfinite(offset) or abs(offset) > 150)):
                raise HTTPException(422, "Recording altitude reference is invalid")
            track = {"id": track_id, "name": str(metadata.get("name", "Recording"))[:200], "reference": metadata["reference"], "geoidOffsetM": metadata.get("geoidOffsetM")}
        key = hashlib.sha256(f"{assignment_id}:{data.sessionId}".encode()).hexdigest()
        record = {"assignmentId": assignment_id, "studentUid": self.user["uid"], "sessionId": data.sessionId,
            "completedAt": session["completedAt"], "submittedAt": now(), "score": score, "thresholdMet": score >= config["requiredScore"],
            "debrief": report, "track": track, "review": None}
        try:
            self.ref.collection("submissions").document(key).create(record)
        except AlreadyExists:
            raise HTTPException(409, "This attempt was already submitted; its shared recording cannot be changed") from None
        return {"id": key, "score": score, "thresholdMet": record["thresholdMet"]}

    def submission(self, key):
        record = self.get("submissions", key)
        self.student(record["studentUid"])
        return record

    def review(self, key, data):
        self.require_staff()
        self.submission(key)
        self.ref.collection("submissions").document(key).update({"review": {**data.model_dump(), "reviewerUid": self.user["uid"], "reviewedAt": now()}})
        return {"status": "saved"}

    def track(self, key):
        record = self.submission(key)
        track = record.get("track")
        if not track:
            raise HTTPException(404, "No recording was shared with this attempt")
        try:
            bucket = storage.bucket(app=self.application)
            blob = bucket.blob(f"users/{record['studentUid']}/tracks/{track['id']}.json")
            blob.reload(timeout=8, retry=None)
            if not blob.size or blob.size > 15000000:
                raise ValueError("Recording too large")
            rows = json.loads(blob.download_as_bytes(if_generation_match=blob.generation, timeout=10, retry=None))
            if not isinstance(rows, list) or not 2 <= len(rows) <= 50000:
                raise ValueError("Invalid recording")
            return {**track, "rows": rows}
        except Exception:
            raise HTTPException(503, "Shared recording unavailable; the owner may have removed it") from None


def school_router(identity, application):
    router = APIRouter(prefix="/api/schools")
    def access(school_id: str, user: Annotated[dict, Depends(identity)]):
        return School(application(), user, school_id)
    Access = Annotated[School, Depends(access)]

    @router.get("/{school_id}")
    def dashboard(school: Access):
        return school.dashboard()

    @router.put("/{school_id}/members/{uid}")
    def member(uid: str, body: Member, school: Access):
        return school.member_write(uid, body)

    @router.delete("/{school_id}/members/{uid}")
    def remove(uid: str, school: Access):
        if not school.admin or uid == school.user["uid"] or school.get("members", uid)["role"] == "school_admin":
            raise HTTPException(403, "Only an administrator can revoke non-admin members")
        school.ref.collection("members").document(identifier(uid)).update({"active": False})
        return {"status": "revoked"}

    @router.post("/{school_id}/scenarios")
    def draft(body: Scenario, school: Access):
        return school.create_scenario(body)

    @router.post("/{school_id}/scenarios/{key}/publish")
    def publish(key: str, school: Access):
        return school.publish(key)

    @router.post("/{school_id}/assignments")
    def assign(body: Assignment, school: Access):
        return school.assign(body)

    @router.post("/{school_id}/assignments/{key}/submit")
    def submit(key: str, body: Submission, school: Access):
        return school.submit(identifier(key), body)

    @router.post("/{school_id}/submissions/{key}/review")
    def review(key: str, body: Review, school: Access):
        return school.review(key, body)

    @router.get("/{school_id}/submissions/{key}/track")
    def track(key: str, school: Access):
        return school.track(key)

    return router
