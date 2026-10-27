"""Pure validation and role-boundary checks. Real Firestore workflows run in emulators."""
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app import main, school

@pytest.fixture(autouse=True)
def fake_quota(monkeypatch):
    monkeypatch.setattr(school, 'reserve_api_quota', Mock())


client = TestClient(main.app)
SCENARIO = {"title": "RWY 27 landmark exercise", "airport": "VOHY", "runway": "27", "aircraft": "demo", "performance": None,
            "weather": "westerly", "windFrom": 270, "windSpeed": 10, "mode": "landmarks", "difficulty": "beginner", "requiredScore": 80, "notes": "Instructor-reviewed ground exercise"}


def test_school_requires_signin():
    assert client.get('/api/schools/example').status_code == 401
    assert client.post('/api/schools/example/scenarios', json=SCENARIO).status_code == 401


@pytest.mark.parametrize('change', [{'airport':'OTHER'}, {'aircraft':'c152'}, {'windSpeed':36}, {'requiredScore':101}, {'mode':'free'}, {'title':''}, {'owner':'forged'}, {'windSpeed':'10'}])
def test_scenario_validation(change):
    with pytest.raises(ValidationError):
        school.Scenario(**{**SCENARIO, **change})


def test_named_aircraft_requires_matching_reviewed_inputs():
    performance = {"version":1, "typeCode":"c152", "source":"Synthetic source", "reference":"Fixture not POH", "reviewedBy":"Reviewer", "bankDeg":20,
        "phaseSpeedsKias": dict.fromkeys(['takeoff','upwind','crosswind','downwind','base','final','landing'], 80)}
    assert school.Scenario(**{**SCENARIO, 'aircraft':'c152', 'performance':performance}).performance.typeCode == 'c152'
    with pytest.raises(ValidationError):
        school.Scenario(**{**SCENARIO, 'aircraft':'c172s', 'performance':performance})
    with pytest.raises(ValidationError):
        school.Scenario(**{**SCENARIO, 'aircraft':'c152', 'performance':{**performance, 'phaseSpeedsKias': {'final':65}}})


@pytest.mark.parametrize('role,member,accepted', [('student','instructor',False), ('instructor','instructor',True), ('platform_admin','instructor',True), ('school_admin','school_admin',True)])
def test_staff_requires_membership_and_trusted_role(monkeypatch, role, member, accepted):
    db = Mock()
    db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value.to_dict.return_value = {'role':member, 'active':True}
    monkeypatch.setattr(school.firestore, 'client', lambda **kwargs: db)
    if accepted:
        assert school.School(object(), {'uid':'teacher','role':role}, 'school-a').staff
    else:
        with pytest.raises(HTTPException):
            school.School(object(), {'uid':'teacher','role':role}, 'school-a')


def test_inactive_and_missing_membership_deny_even_platform_admin(monkeypatch):
    db = Mock()
    target = db.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value.to_dict
    monkeypatch.setattr(school.firestore, 'client', lambda **kwargs: db)
    for membership in [None, {'role':'school_admin','active':False}]:
        target.return_value = membership
        with pytest.raises(HTTPException) as error:
            school.School(object(), {'uid':'admin','role':'platform_admin'}, 'school-a')
        assert error.value.status_code == 403


def test_school_ids_cannot_traverse_paths():
    for value in ['../other','school/other','', 'x'*129]:
        with pytest.raises(HTTPException):
            school.identifier(value)


def test_catalog_scenarios_pin_revision_and_runway():
    config = school.Scenario(**{**SCENARIO,'airport':'ZZZZ','runway':'18'})
    assert config.packageRevision=='synthetic-v1'
    with pytest.raises(ValidationError):
        school.Scenario(**{**SCENARIO,'airport':'ZZZZ','runway':'27'})
