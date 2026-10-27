"""Opt-in aggregate events. Identity is verified but never added to the event log."""
import json
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from app.operations import reserve_api_quota, LOGGER

class TrainingEvent(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    airport: str = Field(pattern=r'^[A-Z]{4}$')
    mode: Literal['guided','practice','landmarks','decisions','quiz','exam']
    recallScore: int | None = Field(ge=0,le=100)


def record_event(application, user, event):
    reserve_api_quota(application,user['uid'])
    LOGGER.info(json.dumps({'severity':'INFO','event':'training_completed',**event.model_dump()}))
    return {'status':'accepted'}
