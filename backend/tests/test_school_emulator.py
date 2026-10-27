"""School authorization and sharing against real local Firebase services."""
import json
import os
import uuid
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth, firestore, storage
from app import main
from test_school import SCENARIO

pytestmark = pytest.mark.skipif(os.getenv('RUN_FIREBASE_FULL_SUITE') != 'true', reason='requires Firebase emulator suite')


def test_school_end_to_end_and_isolation():
    main.firebase_app.cache_clear()
    application = main.firebase_app()
    db = firestore.client(app=application)
    client = TestClient(main.app)
    suffix = uuid.uuid4().hex
    school = f'school-{suffix}'
    other_school = f'other-{suffix}'
    ref = db.collection('schools').document(school)

    def account(name, role):
        email = f'{name}-{suffix}@example.test'
        user = auth.create_user(email=email, password='Local-school-password-123', app=application)
        auth.set_custom_user_claims(user.uid, {'role':role}, app=application)
        signed = httpx.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', json={'email':email,'password':'Local-school-password-123','returnSecureToken':True})
        signed.raise_for_status()
        return user.uid, {'Authorization':'Bearer ' + signed.json()['idToken']}

    admin, admin_headers = account('admin','school_admin')
    teacher, teacher_headers = account('teacher','instructor')
    another, other_headers = account('another','instructor')
    student, student_headers = account('student','student')
    second, second_headers = account('second','student')
    outsider, outsider_headers = account('outsider','platform_admin')
    ref.set({'name':'Test school'})
    for uid, role, mentor in [(admin,'school_admin',None),(teacher,'instructor',None),(another,'instructor',None),(student,'student',teacher),(second,'student',another)]:
        ref.collection('members').document(uid).set({'name':role,'role':role,'instructorUid':mentor,'active':True})
    db.collection('schools').document(other_school).collection('members').document(outsider).set({'name':'Other admin','role':'school_admin','active':True})
    root = f'/api/schools/{school}'
    assert client.get(root, headers=outsider_headers).status_code == 403
    assert client.get(f'/api/schools/{other_school}', headers=teacher_headers).status_code == 403
    assert client.post(root+'/scenarios', headers=student_headers, json=SCENARIO).status_code == 403
    result = client.post(root+'/scenarios', headers=teacher_headers, json=SCENARIO)
    assert result.status_code == 200, result.text
    scenario = result.json()['id']
    assert client.post(root+'/assignments', headers=teacher_headers, json={'scenarioId':scenario,'studentUid':student}).status_code == 409
    assert client.post(root+f'/scenarios/{scenario}/publish', headers=other_headers, json={}).status_code == 403
    assert client.post(root+f'/scenarios/{scenario}/publish', headers=teacher_headers, json={}).status_code == 200
    assert client.post(root+'/assignments', headers=teacher_headers, json={'scenarioId':scenario,'studentUid':second}).status_code == 403
    result = client.post(root+'/assignments', headers=teacher_headers, json={'scenarioId':scenario,'studentUid':student})
    assert result.status_code == 200, result.text
    assignment = result.json()['id']
    session_id = uuid.uuid4().hex
    session = {'id':session_id,'route':'circuit27','mode':'landmarks','difficulty':'beginner','profile':'Demo',
        'completedAt':datetime.now(timezone.utc).isoformat(), 'score':0,'total':5,'windFrom':270,'windSpeed':10,'correctWind':True,
        'answers':[{'index':i, 'passed':i<4} for i in range(5)],
        'assignment':{'schoolId':school,'assignmentId':assignment},
        'environment':{'version':1,'weather':{'qnh':1008,'temperature':30},'aircraft':None}, 'debrief':None}
    target = db.collection('users').document(student).collection('sessions').document(session_id)
    target.set(session)
    track_id = uuid.uuid4().hex
    rows = [{'timestamp':'2026-10-26T12:00:00Z','latitude':17.45,'longitude':78.46,'altitude_m':700},
            {'timestamp':'2026-10-26T12:00:01Z','latitude':17.451,'longitude':78.461,'altitude_m':701}]
    # Server-only seeded fixture; private client Rules are tested separately.
    blob = storage.bucket(app=application).blob(f'users/{student}/tracks/{track_id}.json')
    blob.upload_from_string(json.dumps(rows), content_type='application/json', timeout=8, retry=None)
    db.collection('users').document(student).collection('tracks').document(track_id).set({'path':blob.name,'name':'Synthetic track','reference':'ELLIPSOID','geoidOffsetM':None})
    submit_path = root+f'/assignments/{assignment}/submit'
    assert client.post(submit_path, headers=second_headers, json={'sessionId':session_id}).status_code == 403
    target.update({'windSpeed':12})
    assert client.post(submit_path, headers=student_headers, json={'sessionId':session_id}).status_code == 409
    target.update({'windSpeed':10, 'answers':[{'index':0,'passed':True}]})
    assert client.post(submit_path, headers=student_headers, json={'sessionId':session_id}).status_code == 422
    target.set(session)
    metadata_ref = db.collection('users').document(student).collection('tracks').document(track_id)
    metadata_ref.update({'geoidOffsetM':1000})
    assert client.post(submit_path, headers=student_headers, json={'sessionId':session_id,'trackId':track_id}).status_code == 422
    metadata_ref.update({'geoidOffsetM':None})
    result = client.post(submit_path, headers=student_headers, json={'sessionId':session_id,'trackId':track_id})
    assert result.status_code == 200, result.text
    submission = result.json()['id']
    assert result.json()['score'] == 80 and result.json()['thresholdMet'] is True
    assert client.post(submit_path, headers=student_headers, json={'sessionId':session_id}).status_code == 409
    shared_path = root+f'/submissions/{submission}/track'
    assert client.get(shared_path, headers=other_headers).status_code == 403
    shared = client.get(shared_path, headers=teacher_headers)
    assert shared.status_code == 200, shared.text
    assert shared.json()['rows'] == rows
    review_path = root+f'/submissions/{submission}/review'
    assert client.post(review_path, headers=student_headers, json={'status':'reviewed','notes':'Forged'}).status_code == 403
    assert client.post(review_path, headers=other_headers, json={'status':'reviewed','notes':'Not my student'}).status_code == 403
    assert client.post(review_path, headers=teacher_headers, json={'status':'needs_practice','notes':'Study the base landmark.'}).status_code == 200
    result = client.get(root, headers=student_headers).json()
    assert len(result['students']) == 1 and not result['scenarios']
    assert result['submissions'][0]['review']['notes'] == 'Study the base landmark.'
    assert client.get(root, headers=other_headers).json()['submissions'] == []
    assert client.delete(root+f'/members/{student}', headers=teacher_headers).status_code == 403
    assert client.delete(root+f'/members/{student}', headers=admin_headers).status_code == 200
    assert client.get(root, headers=student_headers).status_code == 403
    assert client.get(shared_path, headers=teacher_headers).status_code == 403


def test_school_pages_are_bounded_and_roster_scoped():
    from app.school import School
    application = main.firebase_app()
    db = firestore.client(app=application)
    suffix = uuid.uuid4().hex
    key = 'pages-' + suffix
    teacher = 'teacher-' + suffix
    ref = db.collection('schools').document(key)
    ref.collection('members').document(teacher).set({'role':'instructor','active':True,'name':'Teacher'})
    batch = db.batch()
    for i in range(76):
        uid = f'student-{i:03}'
        batch.set(ref.collection('members').document(uid),{'role':'student','active':True,'name':uid,'instructorUid':teacher if i<70 else 'other'})
    for i in range(65):
        batch.set(ref.collection('assignments').document(f'assignment-{i:03}'),{'studentUid':'student-000','config':SCENARIO})
        batch.set(ref.collection('submissions').document(f'submission-{i:03}'),{'studentUid':'student-000','score':80})
    batch.commit()
    service = School(application,{'uid':teacher,'role':'instructor'},key)
    first = service.page('students')
    assert len(first['items'])==50 and first['nextCursor'] is not None
    second = service.page('students',after=first['nextCursor'])
    assert len(second['items'])==20 and second['nextCursor'] is None
    assert not set(s['id'] for s in first['items']) & set(s['id'] for s in second['items'])
    for collection in ['assignments','submissions']:
        first = service.page(collection,student_uid='student-000')
        assert len(first['items'])==50
        assert len(service.page(collection,after=first['nextCursor'],student_uid='student-000')['items'])==15
        with pytest.raises(Exception) as error:
            service.page(collection,student_uid='student-075')
        assert error.value.status_code==403
    assert service.dashboard('student-060')['selectedStudent']=='student-060'
